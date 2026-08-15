import type { StreamProfile, StreamCost } from "./types";

export function calculateStreamCost(stream: StreamProfile): StreamCost {
  const pixelsPerSecond = stream.width * stream.height * stream.fps;
  const bitrateMbps = Math.max(0.05, stream.estimatedBitrateKbps / 1000);
  // Start with 1 decoder unit; later phases may weight by codec/resolution
  const decoderUnits = 1;
  return {
    decoderUnits,
    bitrateMbps,
    pixelsPerSecond,
  };
}
