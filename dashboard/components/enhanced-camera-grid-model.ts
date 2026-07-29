export const DECODER_CAPACITY_OPTIONS = [16, 25, 36, 64] as const;

/**
 * A saved workstation preference can lower a stream limit, but must never
 * raise the limit imposed by the page embedding the camera wall.
 */
export function clampDecoderLimit(requested: number, maxConcurrentStreams: number) {
  const maximum = Math.max(1, Math.floor(maxConcurrentStreams));
  const value = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : maximum;
  return Math.min(value, maximum);
}

export function getDecoderCapacityOptions(maxConcurrentStreams: number) {
  const permitted = DECODER_CAPACITY_OPTIONS.filter((option) => option <= maxConcurrentStreams);
  return permitted.length > 0 ? permitted : [Math.max(1, Math.floor(maxConcurrentStreams))];
}
