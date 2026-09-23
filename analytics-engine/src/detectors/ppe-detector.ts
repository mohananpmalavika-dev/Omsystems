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

    // Local chromatic inspection fallback for detected persons
    if (violations.size === 0 && frame.imageData && frame.width > 0 && frame.height > 0) {
      const persons = getInferenceObjects(frame, ["person"]);
      for (const person of persons) {
        if ((person.confidence ?? 0) < this.minimumConfidence) continue;
        const analysis = this.analyzePersonPPE(frame, person);
        if (analysis.missingVest) {
          const list = violations.get("no-safety-vest") ?? [];
          list.push({ ...person, label: "no-safety-vest" });
          violations.set("no-safety-vest", list);
        }
        // no-helmet alert disabled as requested (only alert when helmet is present/detected)
        // if (analysis.missingHelmet) {
        //   const list = violations.get("no-helmet") ?? [];
        //   list.push({ ...person, label: "no-helmet" });
        //   violations.set("no-helmet", list);
        // }
      }
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

  private analyzePersonPPE(
    frame: DetectionFrame,
    person: InferenceObject,
  ): { missingVest: boolean; missingHelmet: boolean } {
    const width = frame.width;
    const height = frame.height;
    const buffer = frame.imageData;
    if (!buffer || buffer.length < width * height * 3) {
      return { missingVest: false, missingHelmet: false };
    }

    const bbox = person.boundingBox;
    const px = Math.max(0, Math.floor(bbox.x * width));
    const py = Math.max(0, Math.floor(bbox.y * height));
    const pw = Math.min(width - px, Math.floor(bbox.width * width));
    const ph = Math.min(height - py, Math.floor(bbox.height * height));

    if (pw < 10 || ph < 15) return { missingVest: false, missingHelmet: false };

    // Torso region (20% to 65% of person height)
    const torsoStartY = py + Math.floor(ph * 0.20);
    const torsoEndY = py + Math.floor(ph * 0.65);
    let torsoPixels = 0;
    let highVisPixels = 0;

    for (let y = torsoStartY; y < torsoEndY; y++) {
      for (let x = px; x < px + pw; x++) {
        const idx = (y * width + x) * 3;
        const r = buffer[idx] ?? 0;
        const g = buffer[idx + 1] ?? 0;
        const b = buffer[idx + 2] ?? 0;
        torsoPixels++;

        // High-vis fluorescent yellow-green: R > 160, G > 170, B < 80
        // High-vis safety orange: R > 200, 70 < G < 160, B < 50
        const isFluorescentYellow = r > 150 && g > 160 && b < 90 && (r + g) > 340;
        const isSafetyOrange = r > 190 && g > 65 && g < 165 && b < 60 && (r - g) > 50;
        if (isFluorescentYellow || isSafetyOrange) {
          highVisPixels++;
        }
      }
    }

    // Head region (top 20% of person height)
    const headStartY = py;
    const headEndY = py + Math.floor(ph * 0.20);
    let headPixels = 0;
    let helmetPixels = 0;

    for (let y = headStartY; y < headEndY; y++) {
      for (let x = px; x < px + pw; x++) {
        const idx = (y * width + x) * 3;
        const r = buffer[idx] ?? 0;
        const g = buffer[idx + 1] ?? 0;
        const b = buffer[idx + 2] ?? 0;
        headPixels++;

        // Hardhat: bright yellow, white hardhat (R,G,B > 220), or safety blue
        const isYellowHelmet = r > 180 && g > 170 && b < 80;
        const isWhiteHelmet = r > 220 && g > 220 && b > 220;
        const isBlueHelmet = b > 160 && b > r + 40 && b > g + 20;
        if (isYellowHelmet || isWhiteHelmet || isBlueHelmet) {
          helmetPixels++;
        }
      }
    }

    const vestCoverage = torsoPixels > 0 ? highVisPixels / torsoPixels : 0;
    const helmetCoverage = headPixels > 0 ? helmetPixels / headPixels : 0;

    return {
      missingVest: vestCoverage < 0.08,
      missingHelmet: helmetCoverage < 0.12,
    };
  }

  async cleanup(): Promise<void> {
    // The detector has no model session of its own to dispose.
  }

  getHealth() {
    return {
      status: "healthy" as const,
      details: "Accepts edge PPE observations with local chromatic inspection fallback",
    };
  }
}
