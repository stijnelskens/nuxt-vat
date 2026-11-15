/**
 * Result of the VIES-backed check.
 *
 * - `valid` / `invalid`: VIES gave a definitive answer.
 * - `invalid_format`: rejected locally (or by VIES as malformed input); VIES was not asked.
 * - `unavailable`: VIES (or the member state behind it) could not answer. This says
 *   nothing about the number itself, so apps decide whether to accept, retry or block.
 */
export type VatStatus = 'valid' | 'invalid' | 'invalid_format' | 'unavailable'

export interface VatFormatResult {
  /** Whether the number matches its country's format (and checksum, where implemented). */
  valid: boolean
  /** Two-letter VAT prefix (`EL` for Greece, `XI` for Northern Ireland), or `null` if unknown. */
  countryCode: string | null
  /** The part after the prefix, or `null` if the prefix is unknown. */
  number: string | null
  /** Prefix + number, cleaned up (`BE0123456789`). Only set when `valid` is true. */
  normalized: string | null
}

interface VatCheckBase {
  /** ISO timestamp of the moment VIES was (or would have been) asked. Cached results keep the original time. */
  checkedAt: string
}

export interface VatCheckValid extends VatCheckBase {
  status: 'valid'
  countryCode: string
  number: string
  /** Registered name, if the member state discloses it. */
  name?: string
  /** Registered address, if the member state discloses it. */
  address?: string
}

export interface VatCheckInvalid extends VatCheckBase {
  status: 'invalid'
  countryCode: string
  number: string
}

export interface VatCheckInvalidFormat extends VatCheckBase {
  status: 'invalid_format'
  countryCode: string | null
  number: string | null
}

export interface VatCheckUnavailable extends VatCheckBase {
  status: 'unavailable'
  countryCode: string
  number: string
  /** VIES error code (e.g. `MS_UNAVAILABLE`, `TIMEOUT`) or `NETWORK_ERROR`, for logging. */
  reason: string
}

export type VatCheckResult = VatCheckValid | VatCheckInvalid | VatCheckInvalidFormat | VatCheckUnavailable
