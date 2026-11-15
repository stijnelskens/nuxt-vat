import { describe, expect, it, vi } from 'vitest'
import { queryVies, VIES_CHECK_URL, type ViesFetch } from '../src/runtime/server/utils/vies'

const request = { countryCode: 'BE', vatNumber: '0417497106' }

/** Mimics ofetch's FetchError for a non-2xx response with a JSON body. */
function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`[POST] ${VIES_CHECK_URL}: ${status}`), { name: 'FetchError', status, data })
}

function mockFetch(...responses: Array<unknown | (() => never)>) {
  const fetch = vi.fn<ViesFetch>()
  for (const response of responses) {
    fetch.mockImplementationOnce(async () => {
      if (typeof response === 'function') return response()
      return response
    })
  }
  return fetch
}

/** A mock response that rejects with `error`. */
function fail(error: unknown) {
  return (): never => {
    throw error
  }
}

const run = (fetch: ViesFetch, retries?: number) =>
  queryVies(request, { fetch, timeout: 1000, retries, retryDelay: 0 })

describe('queryVies', () => {
  it('posts countryCode and vatNumber to the VIES endpoint', async () => {
    const fetch = mockFetch({ valid: false })
    await run(fetch)
    expect(fetch).toHaveBeenCalledWith(VIES_CHECK_URL, {
      method: 'POST',
      body: request,
      timeout: 1000,
      retry: false,
    })
  })

  it('maps a valid response, including name and address', async () => {
    const fetch = mockFetch({
      countryCode: 'BE',
      vatNumber: '0417497106',
      requestDate: '2026-11-15T10:00:00.000Z',
      valid: true,
      name: 'NV ANHEUSER-BUSCH INBEV',
      address: 'Grote Markt 1\n1000 Brussel ',
    })
    expect(await run(fetch)).toEqual({
      status: 'valid',
      name: 'NV ANHEUSER-BUSCH INBEV',
      address: 'Grote Markt 1\n1000 Brussel',
    })
  })

  it('drops undisclosed name/address (---)', async () => {
    const fetch = mockFetch({ valid: true, name: '---', address: '---' })
    expect(await run(fetch)).toEqual({ status: 'valid', name: undefined, address: undefined })
  })

  it('maps an invalid response without retrying', async () => {
    const fetch = mockFetch({ valid: false, name: '---', address: '---' })
    expect(await run(fetch)).toEqual({ status: 'invalid' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('maps a member state outage to unavailable after one retry', async () => {
    const body = { actionSucceed: false, errorWrappers: [{ error: 'MS_UNAVAILABLE', message: 'x' }] }
    const fetch = mockFetch(fail(httpError(500, body)), fail(httpError(500, body)))
    expect(await run(fetch)).toEqual({ status: 'unavailable', reason: 'MS_UNAVAILABLE' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('treats a userError outage in a 200 response as unavailable', async () => {
    const fetch = mockFetch({ valid: false, userError: 'MS_MAX_CONCURRENT_REQ' }, { valid: false, userError: 'MS_MAX_CONCURRENT_REQ' })
    expect(await run(fetch)).toEqual({ status: 'unavailable', reason: 'MS_MAX_CONCURRENT_REQ' })
  })

  it('maps a timeout to unavailable after one retry', async () => {
    const timeout = fail(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    const fetch = mockFetch(timeout, timeout)
    expect(await run(fetch)).toEqual({ status: 'unavailable', reason: 'TIMEOUT' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('enforces the timeout even if fetch ignores it', async () => {
    const fetch = vi.fn<ViesFetch>(() => new Promise(() => {}))
    const outcome = await queryVies(request, { fetch, timeout: 20, retryDelay: 0 })
    expect(outcome).toEqual({ status: 'unavailable', reason: 'TIMEOUT' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('detects a timeout wrapped as the cause of a fetch error', async () => {
    const wrapped = fail(Object.assign(new Error('fetch failed'), { cause: new DOMException('t', 'TimeoutError') }))
    expect(await run(mockFetch(wrapped, wrapped))).toEqual({ status: 'unavailable', reason: 'TIMEOUT' })
  })

  it('maps network errors to unavailable', async () => {
    const down = fail(new TypeError('fetch failed'))
    expect(await run(mockFetch(down, down))).toEqual({ status: 'unavailable', reason: 'NETWORK_ERROR' })
  })

  it('returns the retry result when the second attempt succeeds', async () => {
    const fetch = mockFetch(fail(new TypeError('fetch failed')), { valid: true, name: 'ACME' })
    expect(await run(fetch)).toEqual({ status: 'valid', name: 'ACME', address: undefined })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('maps INVALID_INPUT to invalid_format without retrying', async () => {
    const body = { actionSucceed: false, errorWrappers: [{ error: 'INVALID_INPUT' }] }
    const fetch = mockFetch(fail(httpError(400, body)))
    expect(await run(fetch)).toEqual({ status: 'invalid_format' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('maps unexpected bodies to unavailable', async () => {
    expect(await run(mockFetch('<html>', '<html>'))).toEqual({ status: 'unavailable', reason: 'UNEXPECTED_RESPONSE' })
    expect(await run(mockFetch({ foo: 1 }, { foo: 1 }))).toEqual({ status: 'unavailable', reason: 'UNEXPECTED_RESPONSE' })
  })

  it('respects retries: 0', async () => {
    const fetch = mockFetch(fail(new TypeError('fetch failed')))
    await run(fetch, 0)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
