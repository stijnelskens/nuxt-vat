import { addImports, addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export type { VatCheckResult, VatFormatResult, VatStatus } from './runtime/shared/types'
export type { VatCountryCode, VatCountryRule } from './runtime/shared/format'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled in with the VIES options
export interface ModuleOptions {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-vat',
    configKey: 'vat',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {},
  setup() {
    const resolver = createResolver(import.meta.url)

    // Shared util: one file, registered for both the Vue app and the Nitro server.
    const format = resolver.resolve('./runtime/shared/format')
    addImports({ name: 'isValidVatFormat', from: format })
    addServerImports({ name: 'isValidVatFormat', from: format })
  },
})
