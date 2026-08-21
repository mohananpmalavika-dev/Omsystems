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
    .normalize()
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

function calculateSimilarity(reference: Buffer, candidate: Buffer): number {
  if (reference.length !== candidate.length || reference.length === 0) return 0;

  let referenceMean = 0;
  let candidateMean = 0;
  for (let index = 0; index < reference.length; index += 1) {
    referenceMean += reference[index] ?? 0;
    candidateMean += candidate[index] ?? 0;
  }
  referenceMean /= reference.length;
  candidateMean /= candidate.length;

  let covariance = 0;
  let referenceVariance = 0;
  let candidateVariance = 0;
  let absoluteDifference = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const left = (reference[index] ?? 0) - referenceMean;
    const right = (candidate[index] ?? 0) - candidateMean;
    covariance += left * right;
    referenceVariance += left * left;
    candidateVariance += right * right;
    absoluteDifference += Math.abs((reference[index] ?? 0) - (candidate[index] ?? 0));
  }

  const correlationDenominator = Math.sqrt(referenceVariance * candidateVariance);
  const correlation = correlationDenominator > 0 ? covariance / correlationDenominator : 0;
  const structuralSimilarity = Math.max(0, Math.min(1, (correlation + 1) / 2));
  const pixelSimilarity = Math.max(0, 1 - absoluteDifference / (reference.length * 255));

  return Number((structuralSimilarity * 0.75 + pixelSimilarity * 0.25).toFixed(4));
}

/**
 * Build a small normalized biometric template. The existing profile photo is
 * still retained separately for the employee directory, but verification uses
 * this normalized template rather than comparing raw payload strings.
 */
export async function createEmployeeFaceTemplate(imageDataUrl: string): Promise<EmployeeFaceTemplate> {
  return toTemplate(await normalizeImage(imageDataUrl));
}

export async function verifyEmployeeFace(
  imageDataUrl: string,
  preferences: unknown,
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
    return {
      enrolled: true,
      matched: score >= MIN_MATCH_SCORE,
      score,
      ...(score >= MIN_MATCH_SCORE ? {} : { reason: "mismatch" as const }),
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
  minimumMatchScore: MIN_MATCH_SCORE,
};
