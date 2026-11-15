import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
// Published modules can't rely on auto-imports in their own runtime code.
import { computed, getCurrentScope, onScopeDispose, readonly, ref, shallowRef, toValue, useRuntimeConfig, watch } from '#imports'
import { isValidVatFormat } from '../../shared/format'
import type { VatCheckResult, VatStatus } from '../../shared/types'

export interface VatCompany {
  name?: string
  address?: string
}

export interface UseVatCheckReturn {
  /** `null` while empty or not yet checked; otherwise the latest status for the current input. */
  status: ComputedRef<VatStatus | null>
  /** `true`/`false` once known; `null` while empty, pending, or when VIES is unavailable. */
  valid: ComputedRef<boolean | null>
  /** Registered name/address when VIES says the number is valid (if the member state discloses them). */
  company: ComputedRef<VatCompany | null>
  /** `true` from the moment a check is scheduled (including the debounce) until it settles. */
  pending: Readonly<Ref<boolean>>
  /** Request error talking to the module's own route (not VIES outages, which are `status: 'unavailable'`). */
  error: Readonly<Ref<Error | null>>
  /** Check the current input now, skipping the debounce. */
  refresh: () => Promise<void>
}

/**
 * Reactive VAT number check for forms.
 *
 * The format check runs synchronously (on server and client, so SSR output hydrates
 * cleanly). If the format is valid and VIES is enabled, the module's server route is
 * called on the client only, debounced. Client-side results are for UX: always
 * re-validate with `checkVat` on the server before relying on a number.
 */
export function useVatCheck(input: MaybeRefOrGetter<string | null | undefined>): UseVatCheckReturn {
  const { vies, routePath, debounce } = useRuntimeConfig().public.vat

  const format = computed(() => {
    const value = toValue(input)?.trim()
    return value ? isValidVatFormat(value) : null
  })
  const normalized = computed(() => format.value?.normalized ?? null)

  /** Last server answer, tagged with the number it belongs to so stale answers are never shown. */
  const checked = shallowRef<{ normalized: string, result: VatCheckResult } | null>(null)
  const pending = ref(false)
  const error = shallowRef<Error | null>(null)

  const status = computed<VatStatus | null>(() => {
    if (!format.value) return null
    if (!format.value.valid) return 'invalid_format'
    const current = checked.value
    return current && current.normalized === normalized.value ? current.result.status : null
  })

  const valid = computed<boolean | null>(() => {
    // Format-only mode: the format check is all there is.
    if (!vies) return format.value ? format.value.valid : null
    switch (status.value) {
      case 'valid': return true
      case 'invalid':
      case 'invalid_format': return false
      default: return null
    }
  })

  const company = computed<VatCompany | null>(() => {
    const result = checked.value?.result
    if (status.value !== 'valid' || result?.status !== 'valid') return null
    return { name: result.name, address: result.address }
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined

  function cancel() {
    clearTimeout(timer)
    controller?.abort()
    controller = undefined
  }

  async function run(number: string): Promise<void> {
    cancel()
    const current = new AbortController()
    controller = current
    pending.value = true
    error.value = null
    try {
      const result = await $fetch<VatCheckResult>(routePath, { query: { number }, signal: current.signal })
      if (!current.signal.aborted) checked.value = { normalized: number, result }
    }
    catch (err) {
      if (!current.signal.aborted) error.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      // A newer request owns `pending` now.
      if (controller === current) {
        controller = undefined
        pending.value = false
      }
    }
  }

  function schedule(number: string | null) {
    cancel()
    const alreadyKnown = checked.value?.normalized === number && checked.value.result.status !== 'unavailable'
    if (!vies || !number || alreadyKnown) {
      pending.value = false
      return
    }
    pending.value = true
    timer = setTimeout(() => run(number), debounce)
  }

  async function refresh(): Promise<void> {
    if (vies && normalized.value) await run(normalized.value)
  }

  // Network checks are client-only: nothing is fetched during SSR.
  if (import.meta.client) {
    watch(normalized, schedule, { immediate: true })
  }
  if (getCurrentScope()) {
    onScopeDispose(cancel)
  }

  return {
    status,
    valid,
    company,
    pending: readonly(pending),
    error: readonly(error),
    refresh,
  }
}
