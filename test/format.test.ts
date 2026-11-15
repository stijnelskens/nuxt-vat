import { describe, expect, it } from 'vitest'
import { isValidBelgianChecksum, isValidVatFormat, vatCountryRules } from '../src/runtime/shared/format'

// Format-valid samples per prefix (synthetic unless noted; only BE has a checksum).
const valid: Record<keyof typeof vatCountryRules, string[]> = {
  AT: ['ATU12345678'],
  BE: ['BE0417497106', 'BE1000000021'],
  BG: ['BG123456789', 'BG1234567890'],
  CY: ['CY12345678X'],
  CZ: ['CZ12345678', 'CZ123456789', 'CZ1234567890'],
  DE: ['DE123456789'],
  DK: ['DK12345678'],
  EE: ['EE123456789'],
  EL: ['EL123456789'],
  ES: ['ESA1234567B', 'ES12345678Z', 'ESX1234567A'],
  FI: ['FI12345678'],
  FR: ['FR12345678901', 'FRAB123456789', 'FR1A123456789'],
  HR: ['HR12345678901'],
  HU: ['HU12345678'],
  IE: ['IE1234567T', 'IE1234567TW', 'IE1A23456T'],
  IT: ['IT12345678901'],
  LT: ['LT123456789', 'LT123456789012'],
  LU: ['LU12345678'],
  LV: ['LV12345678901'],
  MT: ['MT12345678'],
  NL: ['NL123456789B01'],
  PL: ['PL1234567890'],
  PT: ['PT123456789'],
  RO: ['RO12', 'RO1234567890'],
  SE: ['SE123456789001'],
  SI: ['SI12345678'],
  SK: ['SK1234567890'],
  XI: ['XI123456789', 'XI123456789012', 'XIGD123', 'XIHA567'],
}

const invalid: Record<keyof typeof vatCountryRules, string[]> = {
  AT: ['AT12345678', 'ATU1234567'],
  BE: ['BE0417497107', 'BE2417497106', 'BE041749710'],
  BG: ['BG12345678', 'BG12345678901'],
  CY: ['CY123456789', 'CY1234567X'],
  CZ: ['CZ1234567', 'CZ12345678901'],
  DE: ['DE12345678', 'DE1234567890'],
  DK: ['DK1234567', 'DK123456789'],
  EE: ['EE12345678'],
  EL: ['EL12345678', 'EL1234567890'],
  ES: ['ES1234567', 'ESAB234567C'],
  FI: ['FI1234567'],
  FR: ['FR1234567890', 'FRIO123456789'],
  HR: ['HR1234567890'],
  HU: ['HU1234567'],
  IE: ['IE12345678', 'IE1234567Z'],
  IT: ['IT1234567890'],
  LT: ['LT1234567890'],
  LU: ['LU1234567'],
  LV: ['LV1234567890'],
  MT: ['MT1234567'],
  NL: ['NL123456789A01', 'NL12345678B01'],
  PL: ['PL123456789'],
  PT: ['PT12345678'],
  RO: ['RO1', 'RO0123456789', 'RO12345678901'],
  SE: ['SE123456789012', 'SE12345678901'],
  SI: ['SI01234567', 'SI1234567'],
  SK: ['SK0123456789', 'SK123456789'],
  XI: ['XI12345678', 'XIGD567', 'XIHA123'],
}

describe('isValidVatFormat', () => {
  it('covers every rule in both sample tables', () => {
    expect(Object.keys(valid).sort()).toEqual(Object.keys(vatCountryRules).sort())
    expect(Object.keys(invalid).sort()).toEqual(Object.keys(vatCountryRules).sort())
  })

  describe.each(Object.keys(vatCountryRules) as (keyof typeof vatCountryRules)[])('%s', (code) => {
    it.each(valid[code])('accepts %s', (input) => {
      expect(isValidVatFormat(input)).toEqual({
        valid: true,
        countryCode: code,
        number: input.slice(2),
        normalized: input,
      })
    })

    it.each(invalid[code])('rejects %s', (input) => {
      const result = isValidVatFormat(input)
      expect(result.valid).toBe(false)
      expect(result.normalized).toBeNull()
      expect(result.countryCode).toBe(code)
    })
  })

  it('normalises case, spaces, dots and dashes', () => {
    expect(isValidVatFormat(' be 0417.497-106 ').normalized).toBe('BE0417497106')
    expect(isValidVatFormat('nl 123456789 b01').normalized).toBe('NL123456789B01')
  })

  it('maps the ISO code GR to the VAT prefix EL', () => {
    expect(isValidVatFormat('GR123456789')).toMatchObject({ valid: true, countryCode: 'EL', normalized: 'EL123456789' })
  })

  it('rejects unknown prefixes and empty input', () => {
    for (const input of ['', '   ', 'GB123456789', 'US123456789', '0417497106', 'B']) {
      expect(isValidVatFormat(input)).toEqual({ valid: false, countryCode: null, number: null, normalized: null })
    }
  })

  it('does not throw on non-string input at runtime', () => {
    expect(isValidVatFormat(undefined as unknown as string).valid).toBe(false)
  })
})

describe('isValidBelgianChecksum', () => {
  it.each(['0417497106', '0403170701', '0202239951', '1000000021'])('accepts %s', (n) => {
    expect(isValidBelgianChecksum(n)).toBe(true)
  })

  it.each(['0417497107', '0417497105', '1000000000', '041749710', 'ABCDEFGHIJ'])('rejects %s', (n) => {
    expect(isValidBelgianChecksum(n)).toBe(false)
  })
})
