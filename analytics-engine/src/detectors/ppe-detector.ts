/**
 * PPE violation detector.
 *
 * PPE models commonly emit a mixture of label spellings (for example,
 * `no-vest` and `no_safety_vest`).  The control plane, however, needs one
 * stable detection type for a rule to be actionable.  This detector only
 * translates actual upstream/local inference observations; it never infers a
 * missing item merely because another item was detected.
 */
import {
  BaseDetector,
  getInferenceObjects,
  type DetectionFrame,
  type DetectionResult,
  type InferenceObject,
} from "./base-detector.js";

const VIOLATION_TYPES: Record<string, "no-helmet" | "no-safety-vest" | "no-gloves" | "no-shoes"> = {
  "no-helmet": "no-helmet",
  "no-hardhat": "no-helmet",
  "no-vest": "no-safety-vest",
  "no-safety-vest": "no-safety-vest",
  "no-high-vis-vest": "no-safety-vest",
  "no-gloves": "no-gloves",
  "no-safety-gloves": "no-gloves",
  "no-shoes": "no-shoes",
  "no-safety-shoes": "no-shoes",
  "no-steel-toe-boots": "no-shoes",
};

function normalizedLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[ _]+/g, "-");
}

export class PPEDetector extends BaseDetector {
  constructor(private readonly minimumConfidence = 0.6) {
    super("ppe", "1.0.0");
  }

  async initialize(): Promise<void> {
    // Observations can be supplied by an edge PPE model. No fake fallback is
    // permitted when the PPE model is not provisioned.
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const violations = new Map<string, InferenceObject[]>();
    for (const object of getInferenceObjects(frame)) {
      if ((object.confidence ?? 0) < this.minimumConfidence) continue;
      const detectionType = VIOLATION_TYPES[normalizedLabel(object.label)];
      if (!detectionType) continue;
      const entries = violations.get(detectionType) ?? [];
      entries.push(object);
      violations.set(detectionType, entries);
    }

    return [...violations].map(([detectionType, objects]) => ({
      detectionType,
      status: "SUCCESS",
      provenance: "LIVE_INFERENCE",
      confidence: Math.min(...objects.map((object) => object.confidence ?? 0)),
      durationSeconds: 1,
      objects,
      metadata: { violationCount: objects.length },
      executionMetadata: {
        status: "SUCCESS",
        provenance: "LIVE_INFERENCE",
        modelId: "ppe-detector",
        modelVersion: this.modelVersion,
        simulated: false,
        timestamp: new Date().toISOString(),
      },
      requiresAlert: true,
    }));
  }

  async cleanup(): Promise<void> {
    // The detector has no model session of its own to dispose.
  }

  getHealth() {
    return {
      status: "healthy" as const,
      details: "Accepts confirmed PPE observations from the inference worker",
    };
  }
}
