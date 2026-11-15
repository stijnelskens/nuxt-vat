/**
 * Stand-in for Nuxt's `#imports` in unit tests of app runtime code: the Vue APIs plus a
 * mutable runtime config. Integration with real Nuxt is covered by the e2e fixtures.
 */
export { computed, getCurrentScope, onScopeDispose, readonly, ref, shallowRef, toValue, watch } from 'vue'

export const runtimeConfig = {
  public: {
    vat: { vies: true, routePath: '/api/_vat/check', debounce: 400 },
  },
}

export const useRuntimeConfig = () => runtimeConfig
