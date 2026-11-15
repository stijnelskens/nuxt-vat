/**
 * Example of server-side validation: never trust the client's check.
 * `checkVat` is auto-imported in Nitro when `vat.vies` is enabled.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ vatNumber?: unknown, companyName?: unknown }>(event)
  if (typeof body?.vatNumber !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'vatNumber is required' })
  }

  const result = await checkVat(body.vatNumber)

  switch (result.status) {
    case 'valid':
      return { ok: true, vatNumber: result.countryCode + result.number, verified: true }
    case 'unavailable':
      // App decision: accept for now and re-check later, rather than block the signup.
      return { ok: true, vatNumber: result.countryCode + result.number, verified: false, recheck: result.reason }
    default:
      throw createError({ statusCode: 422, statusMessage: `VAT number rejected (${result.status})` })
  }
})
