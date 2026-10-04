import sharp from "sharp";
import type { AnalyticsEventInput } from "../control-plane-store.js";

type Box = { x: number; y: number; width: number; height: number };
export interface FalseAlarmSignature {
  version: 1;
  modelVersion: string;
  zone: string | null;
  correlation: string | null;
  trackScope: string;
  objects: Array<{ label: string; trackId: string | null; box: Box | null; pixels: number[] | null }>;
  scenePixels: number[] | null;
}

/** Keep compact appearance evidence, never an image or camera-wide mute. */
export async function buildFalseAlarmSignature(input: AnalyticsEventInput): Promise<FalseAlarmSignature | null> {
  const metadata = input.metadata ?? {};
  const signature: FalseAlarmSignature = {
    version: 1, modelVersion: input.modelVersion,
    zone: typeof metadata.zoneId === "string" ? metadata.zoneId : null,
    correlation: typeof metadata.correlationKey === "string" ? metadata.correlationKey : null,
    // Tracker numbers can be reused after restart or on another day.
    trackScope: typeof metadata.trackerSessionId === "string"
      ? metadata.trackerSessionId : input.occurredAt.slice(0, 10),
    objects: input.objects.map((object) => ({
      label: object.label.toLowerCase(), trackId: object.trackId ?? null,
      box: validBox(object.boundingBox) ? object.boundingBox! : null, pixels: null,
    })),
    scenePixels: null,
  };
  if (typeof metadata.snapshotBase64 === "string" && metadata.snapshotBase64.length <= 8_000_000) {
    try {
      const image = sharp(Buffer.from(metadata.snapshotBase64, "base64"), { limitInputPixels: 16_000_000 });
      const { width, height } = await image.metadata();
      if (width && height) {
        if (signature.objects.length === 0) {
          signature.scenePixels = [...await image.clone().resize(16, 12, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer()];
        } else {
          // Refuse incomplete object evidence; another object must remain alertable.
          for (const object of signature.objects.slice(0, 32)) {
            if (!object.box) continue;
            const left = Math.floor(object.box.x * width);
            const top = Math.floor(object.box.y * height);
            const cropWidth = Math.max(1, Math.min(width - left, Math.ceil(object.box.width * width)));
            const cropHeight = Math.max(1, Math.min(height - top, Math.ceil(object.box.height * height)));
            object.pixels = [...await image.clone().extract({ left, top, width: cropWidth, height: cropHeight })
              .resize(8, 8, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer()];
          }
        }
      }
    } catch {
      // Missing/corrupt visual evidence must not become a broad suppression.
    }
  }
  return signature.correlation || signature.scenePixels ||
    signature.objects.some((object) => object.trackId || object.pixels) ? signature : null;
}

export function matchesFalseAlarm(saved: FalseAlarmSignature | null, incoming: FalseAlarmSignature | null): boolean {
  if (!saved || !incoming || saved.version !== 1 || incoming.version !== 1 ||
      saved.modelVersion !== incoming.modelVersion || saved.zone !== incoming.zone ||
      saved.correlation !== incoming.correlation || saved.objects.length !== incoming.objects.length) return false;
  if (saved.objects.length === 0) {
    return saved.scenePixels && incoming.scenePixels ? similarPixels(saved.scenePixels, incoming.scenePixels)
      : Boolean(saved.correlation && saved.correlation === incoming.correlation);
  }
  const remaining = [...incoming.objects];
  return saved.objects.every((object) => {
    const index = remaining.findIndex((candidate) => {
      if (object.label !== candidate.label) return false;
      if (object.trackId || candidate.trackId) {
        if (!object.trackId || object.trackId !== candidate.trackId || saved.trackScope !== incoming.trackScope) return false;
        // When appearance is available, even a recycled ID must agree visually.
        if (object.pixels || candidate.pixels) return Boolean(object.pixels && candidate.pixels && similarPixels(object.pixels, candidate.pixels));
        return true;
      }
      return Boolean(object.box && candidate.box && overlap(object.box, candidate.box) >= 0.9 &&
        object.pixels && candidate.pixels && similarPixels(object.pixels, candidate.pixels));
    });
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

function validBox(box: Box | undefined): boolean {
  return Boolean(box && [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
    box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
    box.x + box.width <= 1 && box.y + box.height <= 1);
}

function overlap(a: Box, b: Box): number {
  const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}

function similarPixels(a: number[], b: number[]): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    const difference = Math.abs(a[index]! - b[index]!);
    if (!Number.isFinite(difference) || difference > 25) return false;
    total += difference;
  }
  return total / a.length <= 8;
}
