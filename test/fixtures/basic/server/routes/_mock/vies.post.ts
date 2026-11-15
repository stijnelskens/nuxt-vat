/**
 * Fake VIES `check-vat-number`. Answers depend on the number:
 * - BE0417497106 valid (with name/address)
 * - BE0403170701 invalid
 * - NL123456789B01 member state unavailable (HTTP 500, like VIES)
 * - DE123456789 hangs longer than the configured timeout
 */
export default defineEventHandler(async (event) => {
  viesCalls.count++
  const { countryCode, vatNumber } = await readBody<{ countryCode: string, vatNumber: string }>(event)
  const key = countryCode + vatNumber

  switch (key) {
    case 'BE0417497106':
      return { countryCode, vatNumber, valid: true, requestDate: new Date().toISOString(), name: 'NV ANHEUSER-BUSCH INBEV', address: 'Grote Markt 1\n1000 Brussel' }
    case 'BE0403170701':
      return { countryCode, vatNumber, valid: false, name: '---', address: '---' }
    case 'NL123456789B01':
      setResponseStatus(event, 500)
      return { actionSucceed: false, errorWrappers: [{ error: 'MS_UNAVAILABLE', message: 'Member state unavailable' }] }
    case 'DE123456789':
      await new Promise(resolve => setTimeout(resolve, 1000))
      return { countryCode, vatNumber, valid: true }
    default:
      return { countryCode, vatNumber, valid: false }
  }
})
