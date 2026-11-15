/**
 * Plain VIES REST client. It has no Nitro or Nuxt dependencies: the fetch function is
 * passed in, so it can be unit-tested with a mock and reused outside Nitro.
 *
 * Spec: https://ec.europa.eu/assets/taxud/vow-information/swagger_publicVAT.yaml
 */

export const VIES_CHECK_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number'

export interface ViesRequest {
  countryCode: string
  vatNumber: string
}

/** Fetch function contract; `ofetch`/Nitro `$fetch` satisfy it. Must reject on non-2xx. */
export type ViesFetch = (
  url: string,
  options: { method: 'POST', body: ViesRequest, timeout: number, retry: false },
) => Promise<unknown>

export interface ViesClientOptions {
  fetch: ViesFetch
  url?: string
  /** Per-attempt timeout in ms. */
  timeout: number
  /** Extra attempts after an `unavailable` outcome. Default: 1. */
  retries?: number
  /** Delay before a retry in ms. Default: 300. */
  retryDelay?: number
}

export type ViesOutcome
  = | { status: 'valid', name?: string, address?: string }
    | { status: 'invalid' }
    | { status: 'invalid_format' }
    | { status: 'unavailable', reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** VIES returns `---` (or blanks) when a member state does not disclose the field. */
function cleanField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed && trimmed !== '---' ? trimmed : undefined
}

/** First `errorWrappers[].error` code in a VIES error body, if any. */
function errorCodeFromBody(body: unknown): string | undefined {
  if (!isRecord(body) || !Array.isArray(body.errorWrappers)) return undefined
  const first: unknown = body.errorWrappers[0]
  return isRecord(first) && typeof first.error === 'string' ? first.error : undefined
}

function isTimeoutError(error: unknown): boolean {
  if (!isRecord(error)) return false
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true
  return 'cause' in error && isTimeoutError(error.cause)
}

/** Map an error code to an outcome. `INVALID_INPUT` is VIES rejecting the number's format. */
function fromErrorCode(code: string): ViesOutcome {
  return code === 'INVALID_INPUT'
    ? { status: 'invalid_format' }
    : { status: 'unavailable', reason: code }
}

function parseResponse(body: unknown): ViesOutcome {
  if (!isRecord(body)) return { status: 'unavailable', reason: 'UNEXPECTED_RESPONSE' }

  const errorCode = errorCodeFromBody(body)
  if (body.actionSucceed === false || errorCode) {
    return fromErrorCode(errorCode ?? 'UNEXPECTED_RESPONSE')
  }

  // Some VIES responses carry a `userError` such as MS_UNAVAILABLE next to `valid: false`.
  if (typeof body.userError === 'string' && !['VALID', 'INVALID'].includes(body.userError)) {
    return fromErrorCode(body.userError)
  }

  if (body.valid === true) {
    return { status: 'valid', name: cleanField(body.name), address: cleanField(body.address) }
  }
  if (body.valid === false) return { status: 'invalid' }

  return { status: 'unavailable', reason: 'UNEXPECTED_RESPONSE' }
}

function parseError(error: unknown): ViesOutcome {
  // ofetch's FetchError exposes the parsed error body as `data`.
  const code = isRecord(error) ? errorCodeFromBody(error.data) : undefined
  if (code) return fromErrorCode(code)
  return { status: 'unavailable', reason: isTimeoutError(error) ? 'TIMEOUT' : 'NETWORK_ERROR' }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Enforce the timeout ourselves as well: not every fetch implementation honours the
 * abort signal (Nitro's in-process fetch for relative URLs doesn't, for example).
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DOMException(`VIES did not answer within ${ms}ms`, 'TimeoutError')), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * Ask VIES about one number. Never throws: every failure becomes `unavailable`
 * (retried `retries` times first), so callers can tell "VIES is down" from "not registered".
 */
export async function queryVies(request: ViesRequest, options: ViesClientOptions): Promise<ViesOutcome> {
  const { fetch, url = VIES_CHECK_URL, timeout, retries = 1, retryDelay = 300 } = options

  let outcome: ViesOutcome = { status: 'unavailable', reason: 'NOT_ATTEMPTED' }
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && retryDelay > 0) await sleep(retryDelay)
    try {
      outcome = parseResponse(await withTimeout(fetch(url, { method: 'POST', body: request, timeout, retry: false }), timeout))
    }
    catch (error) {
      outcome = parseError(error)
    }
    if (outcome.status !== 'unavailable') break
  }
  return outcome
}
