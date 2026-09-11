/**
 * TPMS_ATTEST Binary Parser
 * Implements TPM 2.0 Library Specification Part 2: Structures (Section 10.12.8)
 */

import {
  TpmsAttest,
  TpmHashAlgorithm,
  TPM_GENERATED_VALUE,
  TPM_ST_ATTEST_QUOTE,
  PcrSelection,
} from '../domain/attestation.types.js';

const TPM_ALG_SHA1 = 0x0004;
const TPM_ALG_SHA256 = 0x000b;
const TPM_ALG_SHA384 = 0x000c;
const TPM_ALG_SHA512 = 0x000d;

export class TpmQuoteParseError extends Error {
  constructor(message: string, public readonly details?: Record<string, any>) {
    super(message);
    this.name = 'TpmQuoteParseError';
  }
}

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
      throw new TpmQuoteParseError(`Unsupported TPM hash algorithm ID: 0x${algId.toString(16)}`);
  }
}

function getExpectedDigestSize(algorithm: TpmHashAlgorithm): number {
  switch (algorithm) {
    case TpmHashAlgorithm.SHA1:
      return 20;
    case TpmHashAlgorithm.SHA256:
      return 32;
    case TpmHashAlgorithm.SHA384:
      return 48;
    case TpmHashAlgorithm.SHA512:
      return 64;
  }
}

class BufferReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readUInt8(): number {
    if (this.offset + 1 > this.buffer.length) {
      throw new TpmQuoteParseError('Unexpected end of buffer reading UInt8');
    }
    const val = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readUInt16BE(): number {
    if (this.offset + 2 > this.buffer.length) {
      throw new TpmQuoteParseError('Unexpected end of buffer reading UInt16');
    }
    const val = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return val;
  }

  readUInt32BE(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new TpmQuoteParseError('Unexpected end of buffer reading UInt32');
    }
    const val = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return val;
  }

  readUInt64BE(): bigint {
    if (this.offset + 8 > this.buffer.length) {
      throw new TpmQuoteParseError('Unexpected end of buffer reading UInt64');
    }
    const val = this.buffer.readBigUInt64BE(this.offset);
    this.offset += 8;
    return val;
  }

  readSizedBuffer(): Buffer {
    const size = this.readUInt16BE();
    if (this.offset + size > this.buffer.length) {
      throw new TpmQuoteParseError(`Unexpected end of buffer reading ${size} bytes`);
    }
    const sub = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return sub;
  }

  readBuffer(size: number): Buffer {
    if (this.offset + size > this.buffer.length) {
      throw new TpmQuoteParseError(`Unexpected end of buffer reading fixed ${size} bytes`);
    }
    const sub = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return sub;
  }

  remaining(): number {
    return this.buffer.length - this.offset;
  }
}

export function parseTpmsAttest(quoteBuffer: Buffer): TpmsAttest {
  if (!Buffer.isBuffer(quoteBuffer) || quoteBuffer.length < 24) {
    throw new TpmQuoteParseError('Invalid quote buffer: insufficient length');
  }

  const reader = new BufferReader(quoteBuffer);

  // 1. Magic (4 bytes)
  const magic = reader.readUInt32BE();
  if (magic !== TPM_GENERATED_VALUE) {
    throw new TpmQuoteParseError(
      `Invalid TPM magic: expected 0x${TPM_GENERATED_VALUE.toString(16)}, got 0x${magic.toString(16)}`,
      { magic }
    );
  }

  // 2. Type (2 bytes)
  const type = reader.readUInt16BE();
  if (type !== TPM_ST_ATTEST_QUOTE) {
    throw new TpmQuoteParseError(
      `Invalid attestation type: expected 0x${TPM_ST_ATTEST_QUOTE.toString(16)} (QUOTE), got 0x${type.toString(16)}`,
      { type }
    );
  }

  // 3. Qualified Signer (TPM2B_NAME)
  const qualifiedSigner = reader.readSizedBuffer();

  // 4. Extra Data (TPM2B_DATA) -> Qualifying challenge nonce
  const extraData = reader.readSizedBuffer();

  // 5. Clock Info (TPMS_CLOCK_INFO)
  const clock = reader.readUInt64BE();
  const resetCount = reader.readUInt32BE();
  const restartCount = reader.readUInt32BE();
  const safe = reader.readUInt8() !== 0;

  // 6. Firmware Version (8 bytes)
  const firmwareVersion = reader.readUInt64BE();

  // 7. Attested Union (TPMS_QUOTE_INFO)
  const pcrSelectionCount = reader.readUInt32BE();
  if (pcrSelectionCount < 1) {
    throw new TpmQuoteParseError('Invalid PCR selection count in quote (must be >= 1)');
  }

  // Parse first selection (standard quote format)
  const hashAlgId = reader.readUInt16BE();
  const hashAlgorithm = parseHashAlgorithm(hashAlgId);
  const sizeofSelect = reader.readUInt8();
  if (sizeofSelect < 1 || sizeofSelect > 4) {
    throw new TpmQuoteParseError(`Invalid PCR select size: ${sizeofSelect}`);
  }

  const pcrSelectBytes = reader.readBuffer(sizeofSelect);
  const pcrs: number[] = [];
  for (let byteIdx = 0; byteIdx < sizeofSelect; byteIdx++) {
    const b = pcrSelectBytes[byteIdx]!;
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      if (b & (1 << bitIdx)) {
        pcrs.push(byteIdx * 8 + bitIdx);
      }
    }
  }

  // If there were multiple selections, skip any subsequent selections up to the pcrDigest
  for (let i = 1; i < pcrSelectionCount; i++) {
    reader.readUInt16BE(); // extra hash alg
    const extraSize = reader.readUInt8();
    reader.readBuffer(extraSize);
  }

  // PCR Digest (TPM2B_DIGEST)
  const pcrDigest = reader.readSizedBuffer();
  const expectedSize = getExpectedDigestSize(hashAlgorithm);
  if (pcrDigest.length !== expectedSize) {
    throw new TpmQuoteParseError(
      `PCR digest length mismatch for ${hashAlgorithm}: expected ${expectedSize}, got ${pcrDigest.length}`
    );
  }

  return {
    magic,
    type,
    qualifiedSigner,
    extraData,
    clockInfo: { clock, resetCount, restartCount, safe },
    firmwareVersion,
    attested: {
      quote: {
        pcrSelect: { hashAlgorithm, pcrs },
        pcrDigest,
      },
    },
    rawBytes: quoteBuffer,
  };
}

export function buildTpmsAttestBuffer(attest: {
  extraData: Buffer;
  clockInfo?: { clock?: bigint; resetCount?: number; restartCount?: number; safe?: boolean };
  firmwareVersion?: bigint;
  pcrSelection: PcrSelection;
  pcrDigest: Buffer;
  qualifiedSigner?: Buffer;
}): Buffer {
  const hashAlgId =
    attest.pcrSelection.hashAlgorithm === TpmHashAlgorithm.SHA1 ? TPM_ALG_SHA1 : TPM_ALG_SHA256;

  // Build PCR bitmap (typically 3 bytes for PCRs 0-23)
  const bitmap = Buffer.alloc(3);
  for (const pcr of attest.pcrSelection.pcrs) {
    if (pcr >= 0 && pcr < 24) {
      const byteIdx = Math.floor(pcr / 8);
      const bitIdx = pcr % 8;
      bitmap[byteIdx] = (bitmap[byteIdx] ?? 0) | (1 << bitIdx);
    }
  }

  const signer = attest.qualifiedSigner || Buffer.alloc(0);
  const totalLength =
    4 + // magic
    2 + // type
    2 + signer.length +
    2 + attest.extraData.length +
    8 + 4 + 4 + 1 + // clockInfo
    8 + // firmwareVersion
    4 + // selection count
    2 + 1 + bitmap.length + // pcrSelect
    2 + attest.pcrDigest.length;

  const buf = Buffer.alloc(totalLength);
  let offset = 0;

  buf.writeUInt32BE(TPM_GENERATED_VALUE, offset);
  offset += 4;

  buf.writeUInt16BE(TPM_ST_ATTEST_QUOTE, offset);
  offset += 2;

  buf.writeUInt16BE(signer.length, offset);
  offset += 2;
  signer.copy(buf, offset);
  offset += signer.length;

  buf.writeUInt16BE(attest.extraData.length, offset);
  offset += 2;
  attest.extraData.copy(buf, offset);
  offset += attest.extraData.length;

  buf.writeBigUInt64BE(attest.clockInfo?.clock ?? BigInt(1000), offset);
  offset += 8;
  buf.writeUInt32BE(attest.clockInfo?.resetCount ?? 1, offset);
  offset += 4;
  buf.writeUInt32BE(attest.clockInfo?.restartCount ?? 1, offset);
  offset += 4;
  buf.writeUInt8(attest.clockInfo?.safe !== false ? 1 : 0, offset);
  offset += 1;

  buf.writeBigUInt64BE(attest.firmwareVersion ?? BigInt(1), offset);
  offset += 8;

  buf.writeUInt32BE(1, offset); // selection count = 1
  offset += 4;

  buf.writeUInt16BE(hashAlgId, offset);
  offset += 2;
  buf.writeUInt8(bitmap.length, offset);
  offset += 1;
  bitmap.copy(buf, offset);
  offset += bitmap.length;

  buf.writeUInt16BE(attest.pcrDigest.length, offset);
  offset += 2;
  attest.pcrDigest.copy(buf, offset);
  offset += attest.pcrDigest.length;

  return buf;
}
