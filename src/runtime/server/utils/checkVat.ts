// Published modules can't rely on auto-imports in their own runtime code, so Nitro
// utilities are imported explicitly. Not from `#imports`: Nuxt also type-checks server
// routes in the *app* context (to type `$fetch`), where `#imports` means the Vue app's.
// Nitro aliases `nitropack/runtime` to the host app's Nitro at build time.
import { defineCachedFunction, useRuntimeConfig } from 'nitropack/runtime'
import { isValidVatFormat } from '../../shared/format'
import type { VatCheckResult } from '../../shared/types'
import { queryVies } from './vies'

async function lookup(normalized: string): Promise<VatCheckResult> {
  const { timeout, viesUrl } = useRuntimeConfig().vat
  const countryCode = normalized.slice(0, 2)
  const number = normalized.slice(2)
  const checkedAt = new Date().toISOString()

  const outcome = await queryVies(
    { countryCode, vatNumber: number },
    {
      url: viesUrl,
      timeout,
      fetch: (url, options) => $fetch<unknown>(url, options),
    },
  )

  return outcome.status === 'invalid_format'
    ? { status: 'invalid_format', countryCode, number, checkedAt }
    : { ...outcome, countryCode, number, checkedAt }
}

type Lookup = (normalized: string) => Promise<VatCheckResult>
let cachedLookup: Lookup | undefined

/**
 * Created on first use rather than at import time, so the TTL comes from the runtime
 * config (which can be overridden per environment, e.g. `NUXT_VAT_CACHE_TTL`).
 */
function getCachedLookup(): Lookup {
  if (!cachedLookup) {
    const ttl = useRuntimeConfig().vat.cacheTtl
    cachedLookup = defineCachedFunction<VatCheckResult, [string]>(lookup, {
      name: 'vies',
      group: 'nuxt-vat',
      getKey: (normalized: string) => normalized,
      maxAge: ttl,
      // Refetch synchronously once expired instead of serving a stale answer.
      swr: false,
      shouldBypassCache: () => ttl <= 0,
      // Returning false keeps the entry out of storage: an outage must not be remembered.
      validate: entry => entry.value !== undefined && entry.value.status !== 'unavailable',
    })
  }
  return cachedLookup
}

/**
 * Validate a VAT number: local format check first, then VIES (cached).
 * Never throws for VIES failures; those come back as `status: 'unavailable'`.
 */
export async function checkVat(input: string): Promise<VatCheckResult> {
  const format = isValidVatFormat(input)
  if (!format.valid || !format.normalized) {
    return {
      status: 'invalid_format',
      countryCode: format.countryCode,
      number: format.number,
      checkedAt: new Date().toISOString(),
    }
  }
  return getCachedLookup()(format.normalized)
}
