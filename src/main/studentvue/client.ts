// Minimal Synergy StudentVUE SOAP client (PXPCommunication.asmx → ProcessWebServiceRequest).
// This is the same web service the official StudentVUE mobile app uses for username/password sign-in.
// Credentials are sent only to the district's own server over HTTPS and are never logged.

import { parseXml, node, str } from './parsers/xml'

export interface Credentials {
  username: string
  password: string
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
}>

export class StudentVueError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'network' | 'server' | 'format' | 'unsupported'
  ) {
    super(message)
  }
}

const NS = 'http://edupoint.com/webservices/'

export function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)
}

export function buildEnvelope(creds: Credentials, methodName: string, params: Record<string, string | number>): string {
  const parms = `<Parms>${Object.entries(params)
    .map(([k, v]) => `<${k}>${xmlEscape(String(v))}</${k}>`)
    .join('')}</Parms>`
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body><ProcessWebServiceRequest xmlns="${NS}">` +
    `<userID>${xmlEscape(creds.username)}</userID>` +
    `<password>${xmlEscape(creds.password)}</password>` +
    '<skipLoginLog>true</skipLoginLog><parent>false</parent>' +
    '<webServiceHandleName>PXPWebServices</webServiceHandleName>' +
    `<methodName>${xmlEscape(methodName)}</methodName>` +
    `<paramStr>${xmlEscape(parms)}</paramStr>` +
    '</ProcessWebServiceRequest></soap:Body></soap:Envelope>'
  )
}

/** Extracts the inner XML string from the SOAP envelope and raises RT_ERROR as typed errors. */
export function unwrapResponse(envelope: string): string {
  let doc
  try {
    doc = parseXml(envelope)
  } catch {
    throw new StudentVueError('StudentVUE returned a response that could not be read.', 'format')
  }
  const body = node(node(doc['soap:Envelope'])?.['soap:Body'])
  const fault = node(body?.['soap:Fault'])
  if (fault) throw new StudentVueError(`StudentVUE server error: ${str(fault, 'faultstring') ?? 'unknown fault'}`, 'server')
  const resp = node(body?.['ProcessWebServiceRequestResponse'])
  const result = resp ? str(resp, 'ProcessWebServiceRequestResult') : null
  if (!result) throw new StudentVueError('StudentVUE returned an empty response.', 'format')
  const inner = result
  const errMatch = inner.match(/<RT_ERROR[^>]*ERROR_MESSAGE="([^"]*)"/)
  if (errMatch) {
    const msg = decodeAttr(errMatch[1] ?? '')
    if (/invalid user id or password|ID:\s*11000/i.test(msg)) throw new StudentVueError('FCPS StudentVUE rejected the username or password.', 'auth')
    if (/locked|disabled/i.test(msg)) throw new StudentVueError(`StudentVUE: ${msg}`, 'auth')
    if (/not (authorized|enabled)|not available|disabled/i.test(msg)) throw new StudentVueError(`StudentVUE: ${msg}`, 'unsupported')
    throw new StudentVueError(`StudentVUE: ${msg}`, 'server')
  }
  return inner
}

function decodeAttr(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export class StudentVueClient {
  private lastRequest = 0

  constructor(
    private readonly baseUrl: string,
    private readonly creds: Credentials,
    private readonly fetchImpl: FetchLike,
    private readonly minIntervalMs = 400
  ) {}

  private get endpoint(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/Service/PXPCommunication.asmx`
  }

  async call(methodName: string, params: Record<string, string | number> = {}): Promise<string> {
    // Be a polite client: space requests out; no parallel bursts.
    const wait = this.lastRequest + this.minIntervalMs - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequest = Date.now()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45000)
    let res
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${NS}ProcessWebServiceRequest"`,
          'User-Agent': 'GradeKiwi/1.0'
        },
        body: buildEnvelope(this.creds, methodName, params),
        signal: controller.signal
      })
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError'
      throw new StudentVueError(aborted ? 'StudentVUE did not respond in time.' : 'Could not reach FCPS StudentVUE. Check your internet connection.', 'network')
    } finally {
      clearTimeout(timer)
    }
    const text = await res.text()
    if (!res.ok && !text.includes('soap:Envelope')) {
      throw new StudentVueError(`StudentVUE responded with HTTP ${res.status}.`, res.status >= 500 ? 'server' : 'network')
    }
    return unwrapResponse(text)
  }
}
