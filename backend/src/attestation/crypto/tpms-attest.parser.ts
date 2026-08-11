/**
 * TPMS_ATTEST Parser
 * Parses and validates TPM quote structures according to TPM 2.0 specification
 * 
 * Reference: TPM 2.0 Library Specification Part 2: Structures
 * Section 10.12.8 - TPMS_ATTEST
 */

import {
  TpmsAttest,
  TpmHashAlgorithm,
  TPM_GENERATED_VALUE,
  TPM_ST_ATTEST_QUOTE,
  AttestationFailureReason,
} from '../domain/attestation.types';
import { TpmQuoteParseError } from '../domain/attestation-errors';

/**
 * TPM algorithm identifiers
 */
const TPM_ALG_SHA1 = 0x0004;
const TPM_ALG_SHA256 = 0x000B;
const TPM_ALG_SHA384 = 0x000C;
const TPM_ALG_SHA512 = 0x000D;

/**
 * Parse TPM hash algorithm ID to our enum
 */
function parseHashAlgorithm(algId: number): TpmHashAlgorithm {
  switch (algId) {
    case TPM_ALG_SHA1:
      return TpmHashAlgorithm.SHA1;
    case TPM_ALG_SHA256:
      return TpmHashAlgorithm.SHA256;
    case TPM_ALG_SHA384:
      return TpmHashAlgorithm.SHA384;
    case TPM_ALG_SHA512:
      return TpmHashAlgorithm.SHA512;
    default:
      throw new TpmQuoteParseError(`Unsupported hash algorithm: 0x${algId.toString(16)}`);
  }
}

/**
 * Get digest size for hash algorithm
 */
function getDigestSize(algorithm: TpmHashAlgorithm): number {
  switch (algorithm) {
    case TpmHashAlgorithm.SHA1:
      return 20;
    case TpmHashAlgorithm.SHA256:
      return 32;
    case TpmHashAlgorithm.SHA384:
      return 48;
    case TpmHashAlgorithm.SHA512:
      return 64;
    default:
      throw new TpmQuoteParseError(`Unknown digest size for algorithm: ${algorithm}`);
  }
}

/**
 * Buffer reader helper for sequential parsing
 */
class BufferReader {
  private offset: number = 0;

  constructor(private buffer: Buffer) {}

  /**
   * Read unsigned 16-bit big-endian integer
   */
  readUInt16BE(): number {
    if (this.offset + 2 > this.buffer.length) {
      throw new TpmQuoteParseError('Unexpected end of buffer reading UInt16');
    }
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  /**
   * Read unsigned 32-bit big-endian integer
   */
  readUInt32BE(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new TpmQuoteParseError('Unexpected end of buffer reading UInt32');
    }
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  /**
   * Read unsigned 64-bit big-endian integer
   */
  readUInt64BE(): bigint {
    if (this.offset + 8 > this.buffer.length) {
      throw new TpmQuoteParseError('Unexpected end of buffer reading UInt64');
    }
    const value = this.buffer.readBigUInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  /**
   * Read unsigned 8-bit integer
   */
  readUInt8(): number {
    if (this.offset + 1 > this.buffer.length) {
      throw new TpmQuoteParseError('Unexpected end of buffer reading UInt8');
    }
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * Read a sized buffer (2-byte length prefix + data)
   */
  readSizedBuffer(): Buffer {
    const size = this.readUInt16BE();
    if (this.offset + size > this.buffer.length) {
      throw new TpmQuoteParseError(`Unexpected end of buffer reading ${size} bytes`);
    }
    const data = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return data;
  }

  /**
   * Read fixed-size buffer
   */
  readBuffer(size: number): Buffer {
    if (this.offset + size > this.buffer.length) {
      throw new TpmQuoteParseError(`Unexpected end of buffer reading ${size} bytes`);
    }
    const data = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return data;
  }

  /**
   * Get current offset
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Get remaining bytes
   */
  remaining(): number {
    return this.buffer.length - this.offset;
  }
}

/**
 * Parse PCR selection from TPML_PCR_SELECTION
 */
function parsePcrSelection(reader: BufferReader): {
  hashAlgorithm: TpmHashAlgorithm;
  pcrs: number[];
} {
  // TPMS_PCR_SELECTION
  const hashAlgId = reader.readUInt16BE();
  const hashAlgorithm = parseHashAlgorithm(hashAlgId);
  
  // sizeofSelect (number of bytes in pcrSelect bitmap)
  const sizeofSelect = reader.readUInt8();
  
  if (sizeofSelect < 1 || sizeofSelect > 4) {
    throw new TpmQuoteParseError(`Invalid PCR select size: ${sizeofSelect}`);
  }
  
  // Read PCR select bitmap
  const pcrSelectBytes = reader.readBuffer(sizeofSelect);
  
  // Convert bitmap to array of PCR indices
  const pcrs: number[] = [];
  for (let byteIdx = 0; byteIdx < sizeofSelect; byteIdx++) {
    const byte = pcrSelectBytes[byteIdx];
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      if (byte & (1 << bitIdx)) {
        pcrs.push(byteIdx * 8 + bitIdx);
      }
    }
  }
  
  return { hashAlgorithm, pcrs };
}

/**
 * Parse TPMS_CLOCK_INFO
 */
function parseClockInfo(reader: BufferReader): {
  clock: bigint;
  resetCount: number;
  restartCount: number;
  safe: boolean;
} {
  const clock = reader.readUInt64BE();
  const resetCount = reader.readUInt32BE();
  const restartCount = reader.readUInt32BE();
  const safe = reader.readUInt8() !== 0;
  
  return { clock, resetCount, restartCount, safe };
}

/**
 * Parse TPMS_ATTEST structure from TPM quote
 * 
 * Structure (all multi-byte integers are big-endian):
 * - magic (4 bytes): TPM_GENERATED_VALUE (0xFF544347)
 * - type (2 bytes): TPM_ST_ATTEST_QUOTE (0x8018)
 * - qualifiedSigner (2 byte size + data)
 * - extraData (2 byte size + data)
 * - clockInfo (TPMS_CLOCK_INFO)
 * - firmwareVersion (8 bytes)
 * - attested (union based on type)
 *   - For TPM_ST_ATTEST_QUOTE:
 *     - TPML_PCR_SELECTION (4 byte count + selections)
 *     - pcrDigest (2 byte size + data)
 */
export function parseTpmsAttest(quoteBuffer: Buffer): TpmsAttest {
  const reader = new BufferReader(quoteBuffer);
  
  try {
    // Parse magic (4 bytes)
    const magic = reader.readUInt32BE();
    if (magic !== TPM_GENERATED_VALUE) {
      throw new TpmQuoteParseError(
        `Invalid TPM magic value: expected 0x${TPM_GENERATED_VALUE.toString(16)}, got 0x${magic.toString(16)}`,
        { expectedMagic: TPM_GENERATED_VALUE, actualMagic: magic }
      );
    }
    
    // Parse type (2 bytes)
    const type = reader.readUInt16BE();
    if (type !== TPM_ST_ATTEST_QUOTE) {
      throw new TpmQuoteParseError(
        `Invalid attestation type: expected 0x${TPM_ST_ATTEST_QUOTE.toString(16)} (QUOTE), got 0x${type.toString(16)}`,
        { expectedType: TPM_ST_ATTEST_QUOTE, actualType: type }
      );
    }
    
    // Parse qualifiedSigner (TPM2B_NAME)
    const qualifiedSigner = reader.readSizedBuffer();
    
    // Parse extraData (TPM2B_DATA) - this contains the nonce
    const extraData = reader.readSizedBuffer();
    
    // Parse clockInfo (TPMS_CLOCK_INFO)
    const clockInfo = parseClockInfo(reader);
    
    // Parse firmwareVersion (8 bytes)
    const firmwareVersion = reader.readUInt64BE();
    
    // Parse attested union - for QUOTE type it's TPMS_QUOTE_INFO
    // TPML_PCR_SELECTION (count + selections)
    const pcrSelectionCount = reader.readUInt32BE();
    
    if (pcrSelectionCount !== 1) {
      // Most implementations use a single PCR selection
      // Multiple selections are rare but valid
      throw new TpmQuoteParseError(
        `Unexpected PCR selection count: ${pcrSelectionCount} (expected 1)`,
        { pcrSelectionCount }
      );
    }
    
    // Parse the PCR selection
    const pcrSelect = parsePcrSelection(reader);
    
    // Parse PCR digest (TPM2B_DIGEST)
    const pcrDigest = reader.readSizedBuffer();
    
    // Validate PCR digest size matches hash algorithm
    const expectedDigestSize = getDigestSize(pcrSelect.hashAlgorithm);
    if (pcrDigest.length !== expectedDigestSize) {
      throw new TpmQuoteParseError(
        `PCR digest size mismatch: expected ${expectedDigestSize} bytes for ${pcrSelect.hashAlgorithm}, got ${pcrDigest.length}`,
        {
          algorithm: pcrSelect.hashAlgorithm,
          expectedSize: expectedDigestSize,
          actualSize: pcrDigest.length,
        }
      );
    }
    
    return {
      magic,
      type,
      qualifiedSigner,
      extraData,
      clockInfo,
      firmwareVersion,
      attested: {
        quote: {
          pcrSelect,
          pcrDigest,
        },
      },
      rawBytes: quoteBuffer,
    };
  } catch (error) {
    if (error instanceof TpmQuoteParseError) {
      throw error;
    }
    throw new TpmQuoteParseError(
      `Failed to parse TPMS_ATTEST: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Validate TPMS_ATTEST structure
 * Performs basic structural validation
 */
export function validateTpmsAttestStructure(attest: TpmsAttest): void {
  // Validate magic
  if (attest.magic !== TPM_GENERATED_VALUE) {
    throw new TpmQuoteParseError(
      `Invalid TPM magic value: 0x${attest.magic.toString(16)}`,
      { reason: AttestationFailureReason.INVALID_TPM_MAGIC }
    );
  }
  
  // Validate type
  if (attest.type !== TPM_ST_ATTEST_QUOTE) {
    throw new TpmQuoteParseError(
      `Invalid attestation type: 0x${attest.type.toString(16)}`,
      { reason: AttestationFailureReason.INVALID_TPM_TYPE }
    );
  }
  
  // Validate PCR digest is not empty
  if (attest.attested.quote.pcrDigest.length === 0) {
    throw new TpmQuoteParseError('PCR digest is empty');
  }
  
  // Validate at least one PCR selected
  if (attest.attested.quote.pcrSelect.pcrs.length === 0) {
    throw new TpmQuoteParseError('No PCRs selected in quote');
  }
  
  // Validate PCR indices are in valid range (0-23 for most TPMs)
  const invalidPcrs = attest.attested.quote.pcrSelect.pcrs.filter(pcr => pcr < 0 || pcr > 23);
  if (invalidPcrs.length > 0) {
    throw new TpmQuoteParseError(
      `Invalid PCR indices: ${invalidPcrs.join(', ')}`,
      { invalidPcrs }
    );
  }
}

/**
 * Extract nonce (extraData) from parsed quote
 */
export function extractNonceFromQuote(attest: TpmsAttest): Buffer {
  return attest.extraData;
}

/**
 * Extract PCR digest from parsed quote
 */
export function extractPcrDigestFromQuote(attest: TpmsAttest): Buffer {
  return attest.attested.quote.pcrDigest;
}

/**
 * Extract PCR selection from parsed quote
 */
export function extractPcrSelection(attest: TpmsAttest): {
  hashAlgorithm: TpmHashAlgorithm;
  pcrs: number[];
} {
  return attest.attested.quote.pcrSelect;
}

/**
 * Parse and validate TPM quote in one operation
 */
export function parseAndValidateQuote(quoteBuffer: Buffer): TpmsAttest {
  const attest = parseTpmsAttest(quoteBuffer);
  validateTpmsAttestStructure(attest);
  return attest;
}
