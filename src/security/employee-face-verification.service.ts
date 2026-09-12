import sharp from "sharp";

const TEMPLATE_SIZE = 48;
const MAX_IMAGE_BYTES = 2_000_000;
const MIN_MATCH_SCORE = 0.86;

export interface EmployeeFaceTemplate {
  version: 1;
  width: number;
  height: number;
  grayscale: true;
  data: string;
}

export interface FaceVerificationResult {
  enrolled: boolean;
  matched: boolean;
  score: number;
  reason?: "not_enrolled" | "invalid_image" | "mismatch";
}

function decodeImageDataUrl(value: string): Buffer {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) {
    throw new Error("Facial scan must be a JPEG, PNG, or WEBP image");
  }

  const encodedImage = match[2];
  if (!encodedImage) {
    throw new Error("Facial scan is empty");
  }
  const image = Buffer.from(encodedImage, "base64");
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
    throw new Error("Facial scan is empty or too large");
  }
  return image;
}

async function normalizeImage(value: string): Promise<Buffer> {
  const image = decodeImageDataUrl(value);
  const normalized = await sharp(image)
    .rotate()
    .resize(TEMPLATE_SIZE, TEMPLATE_SIZE, {
      fit: "cover",
      position: "centre",
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (normalized.info.width !== TEMPLATE_SIZE || normalized.info.height !== TEMPLATE_SIZE) {
    throw new Error("Facial scan could not be normalized");
  }

  let mean = 0;
  for (const value of normalized.data) mean += value;
  mean /= normalized.data.length;
  const variance = normalized.data.reduce(
    (total, value) => total + (value - mean) ** 2,
    0,
  ) / normalized.data.length;
  if (variance < 25) {
    throw new Error("Facial scan does not contain enough visual detail");
  }

  return normalized.data;
}

function toTemplate(data: Buffer): EmployeeFaceTemplate {
  return {
    version: 1,
    width: TEMPLATE_SIZE,
    height: TEMPLATE_SIZE,
    grayscale: true,
    data: data.toString("base64"),
  };
}

function parseTemplate(value: unknown): EmployeeFaceTemplate | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<EmployeeFaceTemplate>;
  if (
    candidate.version !== 1 ||
    candidate.width !== TEMPLATE_SIZE ||
    candidate.height !== TEMPLATE_SIZE ||
    candidate.grayscale !== true ||
    typeof candidate.data !== "string"
  ) {
    return null;
  }

  const data = Buffer.from(candidate.data, "base64");
  return data.length === TEMPLATE_SIZE * TEMPLATE_SIZE
    ? { ...candidate, version: 1, width: TEMPLATE_SIZE, height: TEMPLATE_SIZE, grayscale: true, data: candidate.data }
    : null;
}

// Pre-computed elliptical face mask weights for 48x48 template
// Emphasizes central facial features (eyes, nose, mouth, inner cheeks) while isolating from external background
const MASK_WEIGHTS = new Float32Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
(() => {
  const cx = (TEMPLATE_SIZE - 1) / 2;
  const cy = (TEMPLATE_SIZE - 1) / 2;
  const rx = TEMPLATE_SIZE * 0.28; // Inner face semi-axis (~13.4px)
  const ry = TEMPLATE_SIZE * 0.38; // Inner face vertical semi-axis (~18.2px)
  for (let y = 0; y < TEMPLATE_SIZE; y++) {
    for (let x = 0; x < TEMPLATE_SIZE; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1.0) {
        MASK_WEIGHTS[y * TEMPLATE_SIZE + x] = 1.0;
      } else if (d < 1.25) {
        // Smooth raised-cosine falloff to zero
        const t = (d - 1.0) / 0.25;
        MASK_WEIGHTS[y * TEMPLATE_SIZE + x] = 0.5 * (1 + Math.cos(t * Math.PI));
      } else {
        // Zero out outer perimeter and background
        MASK_WEIGHTS[y * TEMPLATE_SIZE + x] = 0.0;
      }
    }
  }
})();

/**
 * Computes horizontal and vertical Sobel gradient magnitudes for a 48x48 buffer.
 * Gradient features capture facial contours and are largely invariant to ambient illumination changes.
 */
function computeGradients(data: Buffer): Float32Array {
  const gradients = new Float32Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
  for (let y = 1; y < TEMPLATE_SIZE - 1; y++) {
    const prevRow = (y - 1) * TEMPLATE_SIZE;
    const currRow = y * TEMPLATE_SIZE;
    const nextRow = (y + 1) * TEMPLATE_SIZE;
    for (let x = 1; x < TEMPLATE_SIZE - 1; x++) {
      // Sobel X
      const gx =
        -(data[prevRow + x - 1] ?? 0) +
        (data[prevRow + x + 1] ?? 0) -
        2 * (data[currRow + x - 1] ?? 0) +
        2 * (data[currRow + x + 1] ?? 0) -
        (data[nextRow + x - 1] ?? 0) +
        (data[nextRow + x + 1] ?? 0);
      // Sobel Y
      const gy =
        -(data[prevRow + x - 1] ?? 0) -
        2 * (data[prevRow + x] ?? 0) -
        (data[prevRow + x + 1] ?? 0) +
        (data[nextRow + x - 1] ?? 0) +
        2 * (data[nextRow + x] ?? 0) +
        (data[nextRow + x + 1] ?? 0);
      gradients[currRow + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return gradients;
}

/**
 * Production biometric template matching:
 * 1. Elliptical Inner-Face Masking: Isolates internal facial structure (eyes, nose, mouth) from background.
 * 2. Translation Invariance: Evaluates small sub-grid shifts (dx, dy in [-3..3]) to locate optimal facial alignment.
 * 3. Gradient Structure Fusion: Correlates contour gradients to prevent false rejections under lighting variations.
 */
export function calculateSimilarity(reference: Buffer, candidate: Buffer): number {
  if (
    reference.length !== candidate.length ||
    reference.length !== TEMPLATE_SIZE * TEMPLATE_SIZE ||
    reference.length === 0
  ) {
    return 0;
  }

  // Pre-calculate reference weighted mean and variance
  let refSumWeight = 0;
  let refWeightedSum = 0;
  for (let i = 0; i < reference.length; i++) {
    const w = MASK_WEIGHTS[i]!;
    refSumWeight += w;
    refWeightedSum += (reference[i] ?? 0) * w;
  }
  const refMean = refWeightedSum / (refSumWeight || 1);

  let refVariance = 0;
  for (let i = 0; i < reference.length; i++) {
    const diff = (reference[i] ?? 0) - refMean;
    refVariance += diff * diff * MASK_WEIGHTS[i]!;
  }

  // Search small translation shifts to find peak alignment
  const MAX_SHIFT = 3;
  let bestSpatialScore = 0;
  let bestDx = 0;
  let bestDy = 0;

  for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy++) {
    for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx++) {
      let candWeightedSum = 0;
      let shiftSumWeight = 0;

      for (let y = 0; y < TEMPLATE_SIZE; y++) {
        const cy = y + dy;
        if (cy < 0 || cy >= TEMPLATE_SIZE) continue;
        const refRow = y * TEMPLATE_SIZE;
        const candRow = cy * TEMPLATE_SIZE;

        for (let x = 0; x < TEMPLATE_SIZE; x++) {
          const cx = x + dx;
          if (cx < 0 || cx >= TEMPLATE_SIZE) continue;
          const w = MASK_WEIGHTS[refRow + x]!;
          shiftSumWeight += w;
          candWeightedSum += (candidate[candRow + cx] ?? 0) * w;
        }
      }

      if (shiftSumWeight === 0) continue;
      const candMean = candWeightedSum / shiftSumWeight;

      let covariance = 0;
      let candVariance = 0;
      let weightedAbsDiff = 0;

      for (let y = 0; y < TEMPLATE_SIZE; y++) {
        const cy = y + dy;
        if (cy < 0 || cy >= TEMPLATE_SIZE) continue;
        const refRow = y * TEMPLATE_SIZE;
        const candRow = cy * TEMPLATE_SIZE;

        for (let x = 0; x < TEMPLATE_SIZE; x++) {
          const cx = x + dx;
          if (cx < 0 || cx >= TEMPLATE_SIZE) continue;
          const w = MASK_WEIGHTS[refRow + x]!;
          const refDiff = (reference[refRow + x] ?? 0) - refMean;
          const candDiff = (candidate[candRow + cx] ?? 0) - candMean;
          covariance += refDiff * candDiff * w;
          candVariance += candDiff * candDiff * w;
          weightedAbsDiff += Math.abs((reference[refRow + x] ?? 0) - (candidate[candRow + cx] ?? 0)) * w;
        }
      }

      const denom = Math.sqrt(refVariance * candVariance);
      const corr = denom > 0 ? covariance / denom : 0;
      // Direct positive correlation: unrelated images (corr <= 0) yield 0, strong matches yield high values
      const ssim = Math.max(0, corr);
      const pixelSim = Math.max(0, 1 - weightedAbsDiff / (shiftSumWeight * 255));

      // Small penalty for larger spatial offsets to favor centered alignments
      const shiftPenalty = 1 - (Math.abs(dx) + Math.abs(dy)) * 0.015;
      const shiftScore = (ssim * 0.8 + pixelSim * 0.2) * shiftPenalty;

      if (shiftScore > bestSpatialScore) {
        bestSpatialScore = shiftScore;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  // Correlate gradient contours at the optimal spatial alignment
  const refGradients = computeGradients(reference);
  const candGradients = computeGradients(candidate);
  let gradCovariance = 0;
  let refGradVar = 0;
  let candGradVar = 0;

  for (let y = 1; y < TEMPLATE_SIZE - 1; y++) {
    const cy = y + bestDy;
    if (cy < 1 || cy >= TEMPLATE_SIZE - 1) continue;
    const refRow = y * TEMPLATE_SIZE;
    const candRow = cy * TEMPLATE_SIZE;

    for (let x = 1; x < TEMPLATE_SIZE - 1; x++) {
      const cx = x + bestDx;
      if (cx < 1 || cx >= TEMPLATE_SIZE - 1) continue;
      const w = MASK_WEIGHTS[refRow + x]!;
      const rg = refGradients[refRow + x] ?? 0;
      const cg = candGradients[candRow + cx] ?? 0;
      gradCovariance += rg * cg * w;
      refGradVar += rg * rg * w;
      candGradVar += cg * cg * w;
    }
  }

  const gradDenom = Math.sqrt(refGradVar * candGradVar);
  const gradScore = gradDenom > 0 ? Math.max(0, Math.min(1, gradCovariance / gradDenom)) : 0;

  // Composite biometric score
  const finalScore = Number((bestSpatialScore * 0.75 + gradScore * 0.25).toFixed(4));
  return Math.max(0, Math.min(1, finalScore));
}

/**
 * Build a small normalized biometric template. The existing profile photo is
 * still retained separately for the employee directory, but verification uses
 * this normalized template rather than comparing raw payload strings.
 */
export async function createEmployeeFaceTemplate(imageDataUrl: string): Promise<EmployeeFaceTemplate> {
  return toTemplate(await normalizeImage(imageDataUrl));
}

export const PRODUCTION_FACE_MATCH_THRESHOLD = 0.75;
export const STRICT_FACE_MATCH_THRESHOLD = 0.86;

export async function verifyEmployeeFace(
  imageDataUrl: string,
  preferences: unknown,
  options?: { threshold?: number },
): Promise<FaceVerificationResult> {
  const preferencesObject = typeof preferences === "string"
    ? (() => {
        try {
          return JSON.parse(preferences) as Record<string, unknown>;
        } catch {
          return null;
        }
      })()
    : preferences;
  const enrolledTemplate = parseTemplate(
    preferencesObject && typeof preferencesObject === "object"
      ? (preferencesObject as Record<string, unknown>).faceVerification
      : undefined,
  );

  if (!enrolledTemplate) {
    return { enrolled: false, matched: false, score: 0, reason: "not_enrolled" };
  }

  try {
    const liveTemplate = await normalizeImage(imageDataUrl);
    const enrolledData = Buffer.from(enrolledTemplate.data, "base64");
    const score = calculateSimilarity(enrolledData, liveTemplate);
    const threshold = options?.threshold ?? PRODUCTION_FACE_MATCH_THRESHOLD;
    const matched = score >= threshold;

    return {
      enrolled: true,
      matched,
      score,
      ...(matched ? {} : { reason: "mismatch" as const }),
    };
  } catch {
    return { enrolled: true, matched: false, score: 0, reason: "invalid_image" };
  }
}

export function faceTemplatePreferences(template: EmployeeFaceTemplate): Record<string, unknown> {
  return {
    faceVerification: {
      ...template,
      enrolledAt: new Date().toISOString(),
      method: "normalized-face-template",
    },
  };
}

export const employeeFaceVerificationConfig = {
  maxImageBytes: MAX_IMAGE_BYTES,
  templateSize: TEMPLATE_SIZE,
  minimumMatchScore: PRODUCTION_FACE_MATCH_THRESHOLD,
  strictMatchScore: STRICT_FACE_MATCH_THRESHOLD,
};

