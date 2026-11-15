import { z } from 'zod'
import { isValidVatFormat } from './runtime/shared/format'

/**
 * Zod schema for a VAT number: checks the format (and checksum where implemented) and
 * outputs the normalised number (`be 0417.497.106` → `BE0417497106`).
 *
 * Format only, no VIES call; use `checkVat` on the server for registration status.
 *
 * @example
 * import { vatSchema } from 'nuxt-vat/zod'
 * const body = z.object({ vatNumber: vatSchema }).parse(input)
 */
export const vatSchema = z.string().transform((value, ctx) => {
  const { valid, normalized } = isValidVatFormat(value)
  if (!valid || !normalized) {
    ctx.addIssue({ code: 'custom', message: 'Invalid VAT number' })
    return z.NEVER
  }
  return normalized
})
