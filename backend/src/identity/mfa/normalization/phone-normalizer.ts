/**
 * Phone Number Normalizer
 * 
 * Normalizes phone numbers to E.164 format to prevent rate limit bypasses
 * via different representations of the same number.
 * 
 * Examples:
 * - "9876543210" → "+919876543210"
 * - "+91 98765 43210" → "+919876543210"
 * - "0091-9876543210" → "+919876543210"
 */

import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';
import { logger } from '../../../utils/logger.js';

export class PhoneNormalizer {
  /**
   * Normalize phone number to E.164 format
   * 
   * @param phoneNumber - Raw phone number input
   * @param defaultCountry - Default country code if not specified
   * @returns Normalized E.164 phone number or null if invalid
   */
  normalize(
    phoneNumber: string,
    defaultCountry: CountryCode = 'IN'
  ): string | null {
    if (!phoneNumber) {
      return null;
    }

    try {
      // Remove common formatting characters
      const cleaned = phoneNumber.trim().replace(/[\s\-\(\)\.]/g, '');

      // Try parsing with libphonenumber
      const parsed = parsePhoneNumber(cleaned, defaultCountry);

      if (!parsed) {
        logger.debug('Failed to parse phone number', { phoneNumber: this.mask(phoneNumber) });
        return null;
      }

      // Validate
      if (!parsed.isValid()) {
        logger.debug('Invalid phone number', { phoneNumber: this.mask(phoneNumber) });
        return null;
      }

      // Return E.164 format
      return parsed.format('E.164');
    } catch (error) {
      logger.debug('Phone normalization error', {
        phoneNumber: this.mask(phoneNumber),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Validate phone number format
   */
  isValid(phoneNumber: string, defaultCountry: CountryCode = 'IN'): boolean {
    return this.normalize(phoneNumber, defaultCountry) !== null;
  }

  /**
   * Mask phone number for logging (show only last 4 digits)
   */
  mask(phoneNumber: string): string {
    if (!phoneNumber || phoneNumber.length < 4) {
      return '***';
    }
    return '***' + phoneNumber.slice(-4);
  }

  /**
   * Extract country code from normalized number
   */
  getCountryCode(normalizedPhone: string): string | null {
    try {
      const parsed = parsePhoneNumber(normalizedPhone);
      return parsed?.country || null;
    } catch {
      return null;
    }
  }
}
