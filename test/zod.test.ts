import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { vatSchema } from '../src/zod'

describe('vatSchema', () => {
  it('outputs the normalised number', () => {
    expect(vatSchema.parse('be 0417.497.106')).toBe('BE0417497106')
    expect(vatSchema.parse('GR123456789')).toBe('EL123456789')
  })

  it('rejects malformed numbers and bad checksums', () => {
    for (const input of ['', 'BE0417497107', 'XX123', 'DE12345']) {
      const result = vatSchema.safeParse(input)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('Invalid VAT number')
    }
  })

  it('rejects non-strings', () => {
    expect(vatSchema.safeParse(123).success).toBe(false)
  })

  it('composes into object schemas', () => {
    const schema = z.object({ company: z.string(), vat: vatSchema.optional() })
    expect(schema.parse({ company: 'ACME', vat: 'nl 123456789 b01' })).toEqual({ company: 'ACME', vat: 'NL123456789B01' })
    expect(schema.safeParse({ company: 'ACME', vat: 'NL123' }).success).toBe(false)
  })
})
