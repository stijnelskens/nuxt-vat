import { addImports, addServerHandler, addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'
import { VIES_CHECK_URL } from './runtime/server/utils/vies'

export type { VatCheckResult, VatFormatResult, VatStatus } from './runtime/shared/types'
export type { VatCountryCode, VatCountryRule } from './runtime/shared/format'
export type { UseVatCheckReturn, VatCompany } from './runtime/app/composables/useVatCheck'

export interface ModuleOptions {
  /**
   * Check numbers against VIES. `false` keeps format checks only: no server route and no
   * `checkVat` server util are registered.
   * @default true
   */
  vies: boolean
  /**
   * Path of the server route used by `useVatCheck`.
   * @default '/api/_vat/check'
   */
  routePath: string
  /**
   * How long VIES answers are cached, in seconds. `0` disables caching.
   * `unavailable` results are never cached.
   * @default 86400 (24 hours)
   */
  cacheTtl: number
  /**
   * Timeout per VIES request, in milliseconds. A failed request is retried once.
   * @default 8000
   */
  timeout: number
  /**
   * Debounce for `useVatCheck` before it calls the server route, in milliseconds.
   * @default 400
   */
  debounce: number
}

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    vat: {
      cacheTtl: number
      timeout: number
      /** VIES `check-vat-number` endpoint. Override for tests or a proxy. */
      viesUrl: string
    }
  }
  interface PublicRuntimeConfig {
    vat: {
      vies: boolean
      routePath: string
      debounce: number
    }
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-vat',
    configKey: 'vat',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    vies: true,
    routePath: '/api/_vat/check',
    cacheTtl: 60 * 60 * 24,
    timeout: 8000,
    debounce: 400,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Options reach runtime code through runtimeConfig. `defu` puts values the user set
    // directly in `runtimeConfig.vat` first; the module options fill in the rest.
    // Only what the browser needs goes into `public`.
    nuxt.options.runtimeConfig.public.vat = defu(nuxt.options.runtimeConfig.public.vat, {
      vies: options.vies,
      routePath: options.routePath,
      debounce: options.debounce,
    })
    nuxt.options.runtimeConfig.vat = defu(nuxt.options.runtimeConfig.vat, {
      cacheTtl: options.cacheTtl,
      timeout: options.timeout,
      viesUrl: VIES_CHECK_URL,
    })

    // Shared util: one file, registered for both the Vue app and the Nitro server.
    const format = resolver.resolve('./runtime/shared/format')
    addImports({ name: 'isValidVatFormat', from: format })
    addServerImports({ name: 'isValidVatFormat', from: format })

    // Client composable. Without VIES it still gives reactive format checks.
    addImports({ name: 'useVatCheck', from: resolver.resolve('./runtime/app/composables/useVatCheck') })

    if (options.vies) {
      addServerImports({ name: 'checkVat', from: resolver.resolve('./runtime/server/utils/checkVat') })
      addServerHandler({
        route: options.routePath,
        method: 'get',
        handler: resolver.resolve('./runtime/server/api/check.get'),
      })
    }
  },
})
