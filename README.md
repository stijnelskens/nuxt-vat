# Nuxt VAT

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

EU VAT number validation for Nuxt: format checks, VIES lookup with caching, and auto-imported composables for client and server.

- [✨ &nbsp;Release Notes](/CHANGELOG.md)
- [🏀 Online playground](https://stackblitz.com/github/stijnelskens/nuxt-vat?file=playground%2Fapp.vue)

## Features

- **Format checks for all EU member states** (plus `XI` for Northern Ireland), with the Belgian mod-97 checksum. No network, works on client and server.
- **VIES lookup** on the server, with timeout, one retry and caching through Nitro storage.
- **`unavailable` is its own status**: when VIES or a member state is down, you get `unavailable` instead of a misleading `invalid`.
- **`useVatCheck` composable** for forms: debounced, SSR-safe, and it returns the registered company name and address for autofill.
- **Optional Zod schema** at `nuxt-vat/zod`.

## Quick Setup

```bash
npx nuxt module add nuxt-vat
```

Or install it manually and add it to `modules`:

```bash
npm install nuxt-vat
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-vat'],
})
```

## Configuration

All options are optional; these are the defaults:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-vat'],
  vat: {
    vies: true,                  // false = format checks only, no server route
    routePath: '/api/_vat/check', // route used by useVatCheck
    cacheTtl: 60 * 60 * 24,      // seconds to cache VIES answers; 0 disables caching
    timeout: 8000,               // ms per VIES request (retried once)
    debounce: 400,               // ms useVatCheck waits after typing
  },
})
```

The options are passed to runtime code through `runtimeConfig`, so `cacheTtl` and `timeout` can be overridden per environment with `NUXT_VAT_CACHE_TTL` and `NUXT_VAT_TIMEOUT`. `vies` and `routePath` decide which server route is registered at build time, so set those in `nuxt.config`, not through environment variables.

### Cache storage

Answers are cached with Nitro's [`defineCachedFunction`](https://nitro.build/guide/cache) in the `cache` storage mount. By default that is in-memory in production. Mount a persistent driver to share it across instances or keep it across restarts:

```ts
export default defineNuxtConfig({
  nitro: {
    storage: {
      cache: { driver: 'redis', url: process.env.REDIS_URL },
    },
  },
})
```

## Usage

### `isValidVatFormat(input)`: client and server

Auto-imported in the app and in Nitro. Normalises the input (uppercase, no spaces, dots or dashes) and checks the country's format. No network.

```ts
isValidVatFormat('BE 0417.497.106')
// { valid: true, countryCode: 'BE', number: '0417497106', normalized: 'BE0417497106' }

isValidVatFormat('BE0417497107') // bad checksum
// { valid: false, countryCode: 'BE', number: '0417497107', normalized: null }
```

Greece uses the VAT prefix `EL`. `GR` is accepted and normalised to `EL`.

### `useVatCheck(number)`: client form

```vue
<script setup lang="ts">
const form = reactive({ vatNumber: '', companyName: '', address: '' })
const { status, valid, company, pending, refresh } = useVatCheck(() => form.vatNumber)

// Autofill from VIES when the number checks out.
watch(company, (value) => {
  if (value?.name) form.companyName ||= value.name
  if (value?.address) form.address ||= value.address
})
</script>

<template>
  <input v-model="form.vatNumber" placeholder="BE 0417.497.106">
  <p v-if="pending">Checking…</p>
  <p v-else-if="status === 'invalid_format'">This doesn't look like an EU VAT number</p>
  <p v-else-if="status === 'invalid'">Not registered for VAT</p>
  <p v-else-if="status === 'unavailable'">
    VIES can't confirm this right now. <button @click="refresh">Retry</button>
  </p>
  <p v-else-if="valid">✓ {{ company?.name }}</p>
</template>
```

It accepts a ref, a getter or a plain string, and returns refs:

| | |
|---|---|
| `status` | `'valid' \| 'invalid' \| 'invalid_format' \| 'unavailable' \| null` (`null` while empty or not yet checked) |
| `valid` | `true` / `false` once known; `null` while unknown or when VIES is unavailable |
| `company` | `{ name?, address? }` when valid. Some member states (e.g. Germany, Spain) don't disclose these. |
| `pending` | `true` during the debounce and the request |
| `error` | error calling the module's own route (VIES outages are `status: 'unavailable'`) |
| `refresh()` | check now, skipping the debounce |

The format check runs immediately, also during SSR. The VIES check runs only in the browser, and only for numbers with a valid format. With `vies: false`, `valid` reflects the format check alone.

### `checkVat(number)`: server-side validation

Auto-imported in Nitro (when `vies` is enabled). It checks the format first and only asks VIES (cached) when the format is valid. It never throws on VIES failures.

```ts
// server/api/signup.post.ts
export default defineEventHandler(async (event) => {
  const { vatNumber } = await readBody<{ vatNumber: string }>(event)
  const result = await checkVat(vatNumber)

  switch (result.status) {
    case 'valid':
      return createAccount({ vat: result.countryCode + result.number, verified: true })
    case 'unavailable':
      // Your call: accept and re-check later, or ask the user to try again.
      return createAccount({ vat: result.countryCode + result.number, verified: false })
    case 'invalid':
    case 'invalid_format':
      throw createError({ statusCode: 422, statusMessage: 'Invalid VAT number' })
  }
})
```

The result is a discriminated union on `status`:

```ts
type VatCheckResult =
  | { status: 'valid', countryCode: string, number: string, name?: string, address?: string, checkedAt: string }
  | { status: 'invalid', countryCode: string, number: string, checkedAt: string }
  | { status: 'invalid_format', countryCode: string | null, number: string | null, checkedAt: string }
  | { status: 'unavailable', countryCode: string, number: string, reason: string, checkedAt: string }
```

`checkedAt` is when VIES was asked, so a cached answer keeps its original time. `reason` is the VIES error code (`MS_UNAVAILABLE`, `TIMEOUT`, …) for logging. Types can be imported with `import type { VatCheckResult } from 'nuxt-vat'`.

### The route

`GET /api/_vat/check?number=BE0417497106` returns a `VatCheckResult`. Missing or oversized input gets a `400`. Unexpected errors get a generic `500`, with details only in the server log.

### Zod: `nuxt-vat/zod`

Install `zod` (v4) yourself; it's an optional peer dependency.

```ts
import { z } from 'zod'
import { vatSchema } from 'nuxt-vat/zod'

const Signup = z.object({ company: z.string(), vatNumber: vatSchema })
Signup.parse({ company: 'ACME', vatNumber: 'be 0417.497.106' })
// → { company: 'ACME', vatNumber: 'BE0417497106' }
```

`vatSchema` checks the format only. Combine it with `checkVat` for registration status.

## Caveats

### VIES is often unavailable

VIES forwards each request to the member state's own system, and those regularly go down, sometimes for hours. That is why `unavailable` is a separate status. Decide per use case what to do with it: accept the number and re-check it later, let the user continue with a warning, or block. Don't treat it as `invalid`. Unavailable answers are never cached, so the next check asks VIES again.

### Client-side checks are UX only

`useVatCheck` and `isValidVatFormat` in the browser are for user feedback. Anyone can bypass them. Always re-validate on the server with `checkVat` (or at least `isValidVatFormat`/`vatSchema`) before you store a number or base a tax decision on it.

### Scope

v1 covers EU VAT numbers via VIES. UK (HMRC) and Swiss (UID) numbers, VAT rates and VIES consultation numbers are not included. Country formats live in one table (`vatCountryRules`), so adding a checksum or a registry later is a contained change.

## Contribution

<details>
  <summary>Local development</summary>

  ```bash
  # Install dependencies
  pnpm install

  # Generate type stubs
  pnpm dev:prepare

  # Develop with the playground (talks to the real VIES)
  pnpm dev

  # Build the playground
  pnpm dev:build

  # Run ESLint
  pnpm lint

  # Run Vitest (never calls the real VIES)
  pnpm test
  pnpm test:watch

  # Type-check app, server and playground
  pnpm test:types

  # Release new version
  pnpm release
  ```

</details>


<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/nuxt-vat/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/nuxt-vat

[npm-downloads-src]: https://img.shields.io/npm/dm/nuxt-vat.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/nuxt-vat

[license-src]: https://img.shields.io/npm/l/nuxt-vat.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/nuxt-vat

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
