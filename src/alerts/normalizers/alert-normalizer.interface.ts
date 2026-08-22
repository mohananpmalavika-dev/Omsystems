/**
 * Alert Normalizer Adapter Interface
 */

import type { RawAiDetectionEvent, NormalizedAlertCandidate } from "../domain/raw-ai-event.types.js";

export interface IAlertNormalizer {
  readonly id: string;
  canHandle(rawEvent: RawAiDetectionEvent): boolean;
  normalize(rawEvent: RawAiDetectionEvent): NormalizedAlertCandidate;
}
