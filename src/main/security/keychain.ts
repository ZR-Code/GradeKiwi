// Credential storage via Electron safeStorage, backed by the OS:
//   macOS   — AES key held in the user's login Keychain (item "GradeKiwi Safe Storage")
//   Windows — DPAPI, tied to the signed-in Windows user
// Only the ciphertext touches disk; the plaintext password is never written, logged or sent anywhere except to FCPS StudentVUE over HTTPS.

import { safeStorage } from 'electron'
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Credentials } from '../studentvue/client'

export class CredentialStore {
  private memory: Credentials | null = null
  private loaded = false
  private available = false
  private readonly file: string

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'credentials.enc')
  }

  /** Must be awaited once after app 'ready' before the sync accessors are used. */
  async init(): Promise<void> {
    this.available = await safeStorage.isAsyncEncryptionAvailable()
    await this.loadFromDisk()
  }

  get keychainAvailable(): boolean {
    return this.available
  }

  /** remember=false keeps credentials only in memory for this session. */
  async save(creds: Credentials, remember: boolean): Promise<void> {
    this.memory = creds
    if (!remember) {
      this.erase(false)
      return
    }
    if (!this.available) throw new Error('Secure credential storage is unavailable on this system, so credentials cannot be saved.')
    const blob = await safeStorage.encryptStringAsync(JSON.stringify({ u: creds.username, p: creds.password }))
    writeFileSync(this.file, blob, { mode: 0o600 })
    chmodSync(this.file, 0o600)
  }

  private async loadFromDisk(): Promise<void> {
    this.loaded = true
    if (this.memory || !existsSync(this.file) || !this.available) return
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(readFileSync(this.file))
      const v = JSON.parse(result) as { u: string; p: string }
      this.memory = { username: v.u, password: v.p }
      if (shouldReEncrypt) await this.save(this.memory, true)
    } catch {
      this.memory = null // Unreadable (e.g. Keychain item or Windows profile reset): user must reconnect.
    }
  }

  load(): Credentials | null {
    if (!this.loaded) throw new Error('CredentialStore.init() was not awaited')
    return this.memory
  }

  get remembered(): boolean {
    return existsSync(this.file)
  }

  erase(clearMemory = true): void {
    if (clearMemory) this.memory = null
    if (existsSync(this.file)) {
      // Overwrite before unlinking (best effort).
      try {
        writeFileSync(this.file, Buffer.alloc(readFileSync(this.file).length))
      } catch {
        /* best effort */
      }
      rmSync(this.file, { force: true })
    }
  }
}
