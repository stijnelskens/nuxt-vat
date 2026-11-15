// `h3` is aliased by Nuxt to the host app's copy; see utils/checkVat.ts for why not `#imports`.
import { createError, defineEventHandler, getQuery } from 'h3'
import type { VatCheckResult } from '../../shared/types'
import { checkVat } from '../utils/checkVat'

/** Longest plausible input, including separators (`IE 1234567 TW`, `NL 1234.56.789.B.01`). */
const MAX_INPUT_LENGTH = 32

export default defineEventHandler(async (event): Promise<VatCheckResult> => {
  const { number } = getQuery(event)

  if (typeof number !== 'string' || !number.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Query parameter "number" is required' })
  }
  if (number.length > MAX_INPUT_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'Query parameter "number" is too long' })
  }

  try {
    return await checkVat(number)
  }
  catch (error) {
    // checkVat maps VIES failures itself; anything here is unexpected (e.g. cache storage).
    // Log it server-side and return a generic error without the original message or stack.
    console.error('[nuxt-vat] VAT check failed', error)
    throw createError({ statusCode: 500, statusMessage: 'VAT check failed' })
  }
})
