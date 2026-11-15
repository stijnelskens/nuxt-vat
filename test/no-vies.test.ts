import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

describe('vies: false', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/no-vies', import.meta.url)),
  })

  it('still provides format checks', async () => {
    expect(await $fetch<string>('/')).toContain('<div id="valid">true</div>')
  })

  it('does not register the check route', async () => {
    // Without pages/, Nuxt renders app.vue for any unknown URL, so expect HTML, not the JSON handler.
    const res = await fetch('/api/_vat/check?number=BE0417497106')
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('<div id="valid">true</div>')
  })
})
