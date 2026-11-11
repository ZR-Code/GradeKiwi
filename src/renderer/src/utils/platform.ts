// Platform-specific wording and chrome. The app is otherwise identical on macOS and Windows.
import { api } from '../services/api'

export const platform = api.platform
export const isMac = platform === 'darwin'
/** Where credentials are protected: Electron safeStorage uses the Keychain on macOS and DPAPI on Windows. */
export const secureStore = isMac ? 'macOS Keychain' : 'Windows Data Protection (DPAPI)'
export const secureStoreShort = isMac ? 'Keychain' : 'Windows Data Protection'
export const thisDevice = isMac ? 'this Mac' : 'this PC'
