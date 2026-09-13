import type { SecureFaceObservation } from "./secure-face-runtime.js";

/** Requires repeated live observations before an identity payload leaves edge. */
export class SecureFaceObservationBuffer {
  private readonly samples = new Map<string, { count: number; lastAt: number }>();
  constructor(private readonly requiredObservations: number, private readonly windowMs = 5_000) {}

  accept(cameraId: string, observation: SecureFaceObservation): (SecureFaceObservation & { observationCount: number }) | null {
    const key = `${cameraId}:${observation.embedding.slice(0, 8).map((value) => Math.round(value * 1_000)).join(",")}`;
    const now = Date.now();
    const previous = this.samples.get(key);
    const count = previous && now - previous.lastAt <= this.windowMs ? previous.count + 1 : 1;
    this.samples.set(key, { count, lastAt: now });
    return count >= this.requiredObservations ? { ...observation, observationCount: count } : null;
  }
}
