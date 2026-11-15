import type { VatFormatResult } from './types'

export interface VatCountryRule {
  /** Matches the number *without* the country prefix, after normalisation. */
  pattern: RegExp
  /** Optional extra check run after the pattern matches. */
  checksum?: (number: string) => boolean
}

/**
 * Belgian numbers: 10 digits, where the last two equal 97 - (first eight mod 97).
 */
export function isValidBelgianChecksum(number: string): boolean {
  if (!/^\d{10}$/.test(number)) return false
  const base = Number(number.slice(0, 8))
  const check = Number(number.slice(8))
  return 97 - (base % 97) === check
}

/**
 * Format rules per VAT prefix. VAT prefixes are not always ISO codes:
 * Greece uses `EL`, Northern Ireland (EU VAT rules for goods) uses `XI`.
 *
 * To support a new country or add a checksum, add or extend an entry here.
 */
export const vatCountryRules = {
  AT: { pattern: /^U\d{8}$/ },
  BE: { pattern: /^[01]\d{9}$/, checksum: isValidBelgianChecksum },
  BG: { pattern: /^\d{9,10}$/ },
  CY: { pattern: /^\d{8}[A-Z]$/ },
  CZ: { pattern: /^\d{8,10}$/ },
  DE: { pattern: /^\d{9}$/ },
  DK: { pattern: /^\d{8}$/ },
  EE: { pattern: /^\d{9}$/ },
  EL: { pattern: /^\d{9}$/ },
  ES: { pattern: /^[A-Z0-9]\d{7}[A-Z0-9]$/ },
  FI: { pattern: /^\d{8}$/ },
  FR: { pattern: /^[A-HJ-NP-Z0-9]{2}\d{9}$/ },
  HR: { pattern: /^\d{11}$/ },
  HU: { pattern: /^\d{8}$/ },
  IE: { pattern: /^(?:\d{7}[A-W][A-IW]?|\d[A-Z+*]\d{5}[A-W])$/ },
  IT: { pattern: /^\d{11}$/ },
  LT: { pattern: /^(?:\d{9}|\d{12})$/ },
  LU: { pattern: /^\d{8}$/ },
  LV: { pattern: /^\d{11}$/ },
  MT: { pattern: /^\d{8}$/ },
  NL: { pattern: /^\d{9}B\d{2}$/ },
  PL: { pattern: /^\d{10}$/ },
  PT: { pattern: /^\d{9}$/ },
  RO: { pattern: /^[1-9]\d{1,9}$/ },
  SE: { pattern: /^\d{10}01$/ },
  SI: { pattern: /^[1-9]\d{7}$/ },
  SK: { pattern: /^[1-9]\d{9}$/ },
  XI: { pattern: /^(?:\d{9}|\d{12}|GD[0-4]\d{2}|HA[5-9]\d{2})$/ },
} satisfies Record<string, VatCountryRule>

export type VatCountryCode = keyof typeof vatCountryRules

/** Prefixes people commonly type that map to a VAT prefix. */
const prefixAliases: Record<string, VatCountryCode> = {
  GR: 'EL',
}

function isVatCountryCode(code: string): code is VatCountryCode {
  return Object.hasOwn(vatCountryRules, code)
}

/** Uppercase and strip whitespace, dots and dashes: `be 0123.456-789` → `BE0123456789`. */
export function normalizeVatInput(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, '')
}

/**
 * Check a VAT number's format locally (no network). Safe on client and server.
 *
 * Only the format is checked: a well-formed number can still be unregistered.
 */
export function isValidVatFormat(input: string): VatFormatResult {
  const cleaned = normalizeVatInput(typeof input === 'string' ? input : '')
  const prefix = cleaned.slice(0, 2)
  const countryCode = prefixAliases[prefix] ?? prefix

  if (!isVatCountryCode(countryCode)) {
    return { valid: false, countryCode: null, number: null, normalized: null }
  }

  const number = cleaned.slice(2)
  const rule: VatCountryRule = vatCountryRules[countryCode]
  const valid = rule.pattern.test(number) && (rule.checksum?.(number) ?? true)

  return {
    valid,
    countryCode,
    number,
    normalized: valid ? countryCode + number : null,
  }
}
