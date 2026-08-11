/**
 * TPM 2.0 Quote Verifier Implementation
 * Verifies TPM2_Quote signatures and PCR digests
 * 
 * NOTE: This is a foundation implementation that uses external tpm2-tools
 * for cryptographic verification. Production systems should use tpm2-tss
 * library bindings for better performance and integration.
 */

import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TpmQuoteVerifier,
  QuoteVerificationError,
  QuoteVerificationErrorCode
} from './tpm-quote-verifier.interface';
import {
  ParsedTpmQuote,
  PcrSelection
} from '../types/attestation.types';
import { calculatePcrCompositeDigest } from '../utils/attestation-crypto.utils';

const execAsync = promisify(exec);

export class Tpm2QuoteVerifier implements TpmQuoteVerifier {
  private useTpm2Tools: boolean = false;

  constructor(config?: { useTpm2Tools?: boolean }) {
    this.useTpm2Tools = config?.useTpm2Tools || false;
  }

  /**
   * Parse TPM quote structure
   * This is a simplified parser - production should use proper TPM2 structure parsing
   */
  async parse(quote: string): Promise<ParsedTpmQuote> {
    try {
      const quoteBuffer = Buffer.from(quote, 'base64');

      // TPM2 quote structure parsing would go here
      // For now, return a placeholder structure
      // Real implementation needs to parse TPMS_ATTEST structure

      return {
        magic: 'ff544347', // TPM_GENERATED_VALUE
        qualifiedSigner: '',
        extraData: Buffer.alloc(0),
        clockInfo: {
          clock: BigInt(0),
          resetCount: 0,
          restartCount: 0,
          safe: true
        },
        firmwareVersion: BigInt(0),
        attested: {
          quote: {
            pcrSelect: {
              hashAlgorithm: 'sha256',
              pcrs: []
            },
            pcrDigest: Buffer.alloc(0)
          }
        }
      };
    } catch (error) {
      throw new QuoteVerificationError(
        'Failed to parse TPM quote',
        QuoteVerificationErrorCode.PARSING_ERROR,
        error
      );
    }
  }

  /**
   * Verify quote signature using AK public key
   */
  async verifySignature(input: {
    quote: string;
    signature: string;
    akPublicKeyPem: string;
  }): Promise<boolean> {
    if (this.useTpm2Tools) {
      return this.verifySignatureWithTpm2Tools(input);
    }

    try {
      // Decode base64
      const quoteBuffer = Buffer.from(input.quote, 'base64');
      const signatureBuffer = Buffer.from(input.signature, 'base64');

      // Create verifier with AK public key
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(quoteBuffer);

      // Verify signature
      const valid = verifier.verify(input.akPublicKeyPem, signatureBuffer);

      return valid;
    } catch (error) {
      console.error('Quote signature verification error:', error);
      throw new QuoteVerificationError(
        'Signature verification failed',
        QuoteVerificationErrorCode.SIGNATURE_VERIFICATION_FAILED,
        error
      );
    }
  }

  /**
   * Verify signature using tpm2_checkquote tool
   */
  private async verifySignatureWithTpm2Tools(input: {
    quote: string;
    signature: string;
    akPublicKeyPem: string;
  }): Promise<boolean> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpm-verify-'));

    try {
      // Write files for tpm2_checkquote
      const quotePath = path.join(tmpDir, 'quote.bin');
      const sigPath = path.join(tmpDir, 'signature.bin');
      const keyPath = path.join(tmpDir, 'ak.pem');

      await fs.writeFile(quotePath, Buffer.from(input.quote, 'base64'));
      await fs.writeFile(sigPath, Buffer.from(input.signature, 'base64'));
      await fs.writeFile(keyPath, input.akPublicKeyPem);

      // Run tpm2_checkquote
      const cmd = `tpm2_checkquote -u ${keyPath} -m ${quotePath} -s ${sigPath}`;
      
      try {
        await execAsync(cmd);
        return true;
      } catch (error) {
        return false;
      }
    } finally {
      // Cleanup temp files
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Verify PCR digest matches submitted values
   */
  async verifyPcrDigest(input: {
    quote: ParsedTpmQuote;
    pcrValues: Record<string, string>;
    selection: PcrSelection;
  }): Promise<boolean> {
    try {
      // Calculate expected PCR digest from submitted values
      const expectedDigest = calculatePcrCompositeDigest(
        input.pcrValues,
        input.selection
      );

      // Extract quoted PCR digest
      const quotedDigest = input.quote.attested.quote.pcrDigest;

      // Timing-safe comparison
      if (expectedDigest.length !== quotedDigest.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedDigest, quotedDigest);
    } catch (error) {
      console.error('PCR digest verification error:', error);
      throw new QuoteVerificationError(
        'PCR digest verification failed',
        QuoteVerificationErrorCode.PCR_DIGEST_MISMATCH,
        error
      );
    }
  }

  /**
   * Extract nonce/extra data from quote
   */
  async extractExtraData(quote: string): Promise<Buffer> {
    const parsed = await this.parse(quote);
    return parsed.extraData;
  }

  /**
   * Extract PCR digest from parsed quote
   */
  extractPcrDigest(quote: ParsedTpmQuote): Buffer {
    return quote.attested.quote.pcrDigest;
  }
}

/**
 * Mock verifier for testing without TPM
 * NEVER use in production
 */
export class MockTpmQuoteVerifier implements TpmQuoteVerifier {
  async parse(quote: string): Promise<ParsedTpmQuote> {
    return {
      magic: 'ff544347',
      qualifiedSigner: 'mock',
      extraData: Buffer.from('mock-nonce'),
      clockInfo: {
        clock: BigInt(Date.now()),
        resetCount: 0,
        restartCount: 0,
        safe: true
      },
      firmwareVersion: BigInt(1),
      attested: {
        quote: {
          pcrSelect: {
            hashAlgorithm: 'sha256',
            pcrs: [0, 2, 4, 7]
          },
          pcrDigest: Buffer.alloc(32)
        }
      }
    };
  }

  async verifySignature(input: {
    quote: string;
    signature: string;
    akPublicKeyPem: string;
  }): Promise<boolean> {
    console.warn('⚠️  MockTpmQuoteVerifier: Always returns true - DO NOT USE IN PRODUCTION');
    return true;
  }

  async verifyPcrDigest(input: {
    quote: ParsedTpmQuote;
    pcrValues: Record<string, string>;
    selection: PcrSelection;
  }): Promise<boolean> {
    console.warn('⚠️  MockTpmQuoteVerifier: Always returns true - DO NOT USE IN PRODUCTION');
    return true;
  }

  async extractExtraData(quote: string): Promise<Buffer> {
    return Buffer.from('mock-nonce');
  }

  extractPcrDigest(quote: ParsedTpmQuote): Buffer {
    return Buffer.alloc(32);
  }
}

/**
 * Factory to create appropriate verifier
 */
export function createTpmQuoteVerifier(config?: {
  mock?: boolean;
  useTpm2Tools?: boolean;
}): TpmQuoteVerifier {
  if (config?.mock) {
    console.warn('⚠️  Using MockTpmQuoteVerifier - DO NOT USE IN PRODUCTION');
    return new MockTpmQuoteVerifier();
  }

  return new Tpm2QuoteVerifier(config);
}
