import NuxtVat from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    NuxtVat,
  ],
  runtimeConfig: {
    vat: {
      // Point the module at the fake VIES in server/routes/_mock; tests never call the real one.
      viesUrl: '/_mock/vies',
    },
  },
  vat: {
    // Short timeout so the "VIES hangs" case stays fast.
    timeout: 200,
  },
})
