export type G711Codec = "PCMA" | "PCMU";

const SEGMENT_END = [0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff, 0x7fff] as const;

export function encodeG711(pcm16le: Uint8Array, codec: G711Codec) {
  if (pcm16le.byteLength % 2 !== 0) throw new Error("pcm16_payload_must_be_even");
  const input = new DataView(pcm16le.buffer, pcm16le.byteOffset, pcm16le.byteLength);
  const output = new Uint8Array(pcm16le.byteLength / 2);
  for (let index = 0; index < output.length; index += 1) {
    const sample = input.getInt16(index * 2, true);
    output[index] = codec === "PCMA" ? linearToAlaw(sample) : linearToMulaw(sample);
  }
  return output;
}

function segment(value: number) {
  const found = SEGMENT_END.findIndex((limit) => value <= limit);
  return found === -1 ? 8 : found;
}

function linearToAlaw(value: number) {
  let sample = value;
  let mask: number;
  if (sample >= 0) mask = 0xd5;
  else { mask = 0x55; sample = -sample - 8; }
  const exponent = segment(sample);
  if (exponent >= 8) return 0x7f ^ mask;
  const mantissa = exponent < 2 ? (sample >> 4) & 0x0f : (sample >> (exponent + 3)) & 0x0f;
  return ((exponent << 4) | mantissa) ^ mask;
}

function linearToMulaw(value: number) {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sample = value;
  const mask = sample < 0 ? 0x7f : 0xff;
  if (sample < 0) sample = -sample;
  sample = Math.min(CLIP, sample) + BIAS;
  const exponent = segment(sample);
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return (~((exponent << 4) | mantissa)) & mask;
}
