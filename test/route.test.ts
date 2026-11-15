import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import type { VatCheckResult } from '../src/runtime/shared/types'

const check = (number: string) => $fetch<VatCheckResult>('/api/_vat/check', { query: { number } })
const viesCalls = () => $fetch<number>('/_mock/vies-calls')

describe('VIES check route (fake VIES)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  it('auto-imports isValidVatFormat in the app', async () => {
    expect(await $fetch<string>('/')).toContain('<div id="normalized">BE0417497106</div>')
  })

  it('returns valid with name and address', async () => {
    expect(await check('BE 0417.497.106')).toMatchObject({
      status: 'valid',
      countryCode: 'BE',
      number: '0417497106',
      name: 'NV ANHEUSER-BUSCH INBEV',
      address: 'Grote Markt 1\n1000 Brussel',
      checkedAt: expect.any(String),
    })
  })

  it('caches answers from VIES', async () => {
    const before = await viesCalls()
    const first = await check('BE0417497106')
    expect(await viesCalls()).toBe(before)
    expect((await check('be0417497106')).checkedAt).toBe(first.checkedAt)
  })

  it('returns invalid', async () => {
    expect(await check('BE0403170701')).toMatchObject({ status: 'invalid', countryCode: 'BE', number: '0403170701' })
  })

  it('returns invalid_format without calling VIES', async () => {
    const before = await viesCalls()
    expect(await check('BE0403170702')).toMatchObject({ status: 'invalid_format', countryCode: 'BE' })
    expect(await check('XX123')).toMatchObject({ status: 'invalid_format', countryCode: null, number: null })
    expect(await viesCalls()).toBe(before)
  })

  it('returns unavailable when the member state is down, retries once, and does not cache it', async () => {
    const before = await viesCalls()
    expect(await check('NL123456789B01')).toMatchObject({ status: 'unavailable', reason: 'MS_UNAVAILABLE' })
    expect(await viesCalls()).toBe(before + 2)
    await check('NL123456789B01')
    expect(await viesCalls()).toBe(before + 4)
  })

  it('returns unavailable on timeout', async () => {
    expect(await check('DE123456789')).toMatchObject({ status: 'unavailable', reason: 'TIMEOUT' })
  })

  it('rejects a missing or oversized number with 400 and no stack trace', async () => {
    for (const query of ['', '?number=', `?number=${'1'.repeat(40)}`]) {
      const res = await fetch(`/api/_vat/check${query}`)
      expect(res.status).toBe(400)
      const body = await res.text()
      expect(body).not.toContain('at ')
      expect(body).not.toContain('.ts')
    }
  })
})
