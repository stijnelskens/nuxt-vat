import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useVatCheck } from '../src/runtime/app/composables/useVatCheck'
import type { VatCheckResult } from '../src/runtime/shared/types'
import { runtimeConfig } from './shims/imports'

const checkedAt = '2026-11-15T10:00:00.000Z'
const results: Record<string, VatCheckResult> = {
  BE0417497106: { status: 'valid', countryCode: 'BE', number: '0417497106', name: 'ACME', address: 'Street 1', checkedAt },
  BE0403170701: { status: 'invalid', countryCode: 'BE', number: '0403170701', checkedAt },
  NL123456789B01: { status: 'unavailable', countryCode: 'NL', number: '123456789B01', reason: 'MS_UNAVAILABLE', checkedAt },
}

const fetchMock = vi.fn(async (_url: string, options: { query: { number: string }, signal: AbortSignal }) => {
  const result = results[options.query.number]
  if (!result) throw new Error('unexpected number')
  return result
})

/** Run the composable inside a scope, like a component would. */
function setup(initial = '') {
  const input = ref(initial)
  const scope = effectScope()
  const check = scope.run(() => useVatCheck(input))!
  return { input, check, scope }
}

/** Let the debounce elapse and the mocked request settle. */
async function settle() {
  await vi.advanceTimersByTimeAsync(400)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('$fetch', fetchMock)
  fetchMock.mockClear()
  runtimeConfig.public.vat.vies = true
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useVatCheck', () => {
  it('starts empty and unknown', () => {
    const { check } = setup()
    expect(check.status.value).toBeNull()
    expect(check.valid.value).toBeNull()
    expect(check.company.value).toBeNull()
    expect(check.pending.value).toBe(false)
  })

  it('reports invalid_format synchronously and never calls the route', async () => {
    const { input, check } = setup()
    input.value = 'BE0403170702'
    await nextTick()
    expect(check.status.value).toBe('invalid_format')
    expect(check.valid.value).toBe(false)
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('debounces, then calls the route with the normalised number', async () => {
    const { input, check } = setup()
    input.value = 'be 0417.497.106'
    await nextTick()
    expect(check.pending.value).toBe(true)
    await vi.advanceTimersByTimeAsync(399)
    expect(fetchMock).not.toHaveBeenCalled()
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/_vat/check', expect.objectContaining({ query: { number: 'BE0417497106' } }))
    expect(check.status.value).toBe('valid')
    expect(check.valid.value).toBe(true)
    expect(check.company.value).toEqual({ name: 'ACME', address: 'Street 1' })
    expect(check.pending.value).toBe(false)
  })

  it('only sends the last value when typing quickly', async () => {
    const { input } = setup()
    input.value = 'BE0403170701'
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    input.value = 'BE0417497106'
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![1].query.number).toBe('BE0417497106')
  })

  it('reports invalid with valid=false', async () => {
    const { check } = setup('BE0403170701')
    await settle()
    expect(check.status.value).toBe('invalid')
    expect(check.valid.value).toBe(false)
    expect(check.company.value).toBeNull()
  })

  it('reports unavailable with valid=null and retries it when re-entered', async () => {
    const { input, check } = setup('NL123456789B01')
    await settle()
    expect(check.status.value).toBe('unavailable')
    expect(check.valid.value).toBeNull()
    input.value = ''
    await nextTick()
    input.value = 'NL123456789B01'
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not refetch a known answer, but refresh() does', async () => {
    const { input, check } = setup('BE0417497106')
    await settle()
    input.value = 'BE 0417 497 106'
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await check.refresh()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('hides a previous answer as soon as the input changes', async () => {
    const { input, check } = setup('BE0417497106')
    await settle()
    input.value = 'BE0403170701'
    await nextTick()
    expect(check.status.value).toBeNull()
    expect(check.company.value).toBeNull()
  })

  it('ignores a response that arrives after the input changed', async () => {
    let resolveFirst: (value: VatCheckResult) => void = () => {}
    fetchMock.mockImplementationOnce((_url, { signal }) => new Promise((resolve, reject) => {
      resolveFirst = resolve
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const { input, check } = setup('BE0403170701')
    await settle()
    input.value = 'BE0417497106'
    await settle()
    resolveFirst(results.BE0403170701!)
    await nextTick()
    expect(check.status.value).toBe('valid')
    expect(check.error.value).toBeNull()
  })

  it('exposes route errors via error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('500 VAT check failed'))
    const { check } = setup('BE0417497106')
    await settle()
    expect(check.error.value?.message).toBe('500 VAT check failed')
    expect(check.status.value).toBeNull()
    expect(check.pending.value).toBe(false)
  })

  it('cancels a scheduled check when the scope is disposed', async () => {
    const { scope } = setup('BE0417497106')
    scope.stop()
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to format validity when vies is disabled', async () => {
    runtimeConfig.public.vat.vies = false
    const { input, check } = setup('BE0417497106')
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(check.status.value).toBeNull()
    expect(check.valid.value).toBe(true)
    input.value = 'BE0417497107'
    await nextTick()
    expect(check.valid.value).toBe(false)
  })
})
