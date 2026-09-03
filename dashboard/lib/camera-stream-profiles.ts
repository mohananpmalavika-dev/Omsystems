import type { Camera, CameraStreamProfile } from "./types";

interface LegacyCameraProfile {
  name?: unknown;
  role?: unknown;
  codec?: unknown;
  width?: unknown;
  height?: unknown;
  frameRate?: unknown;
  fps?: unknown;
  bitrateKbps?: unknown;
  estimatedBitrateKbps?: unknown;
}

/**
 * The control plane exposes its persisted camera profiles as `profiles`, while
 * the wall scheduler consumes the normalized `streamProfiles` contract. Keep
 * that compatibility conversion at the dashboard boundary so real cameras do
 * not get incorrectly relegated to snapshot-only playback.
 */
export function normalizeCameraStreamProfiles(camera: Camera & { profiles?: unknown }): Camera {
  if (camera.streamProfiles?.length) return camera;
  if (!Array.isArray(camera.profiles)) return camera;

  const streamProfiles = camera.profiles
    .map(normalizeLegacyProfile)
    .filter((profile): profile is CameraStreamProfile => Boolean(profile));

  return streamProfiles.length > 0 ? { ...camera, streamProfiles } : camera;
}

function normalizeLegacyProfile(value: unknown): CameraStreamProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const profile = value as LegacyCameraProfile;
  const width = positiveNumber(profile.width);
  const height = positiveNumber(profile.height);
  if (!width || !height) return undefined;

  const type = normalizeProfileType(profile.role, profile.name);
  return {
    type,
    codec: normalizeCodec(profile.codec),
    width,
    height,
    fps: positiveNumber(profile.frameRate) ?? positiveNumber(profile.fps) ?? 15,
    estimatedBitrateKbps:
      positiveNumber(profile.bitrateKbps) ??
      positiveNumber(profile.estimatedBitrateKbps) ??
      defaultBitrate(type),
  };
}

function normalizeProfileType(role: unknown, name: unknown): CameraStreamProfile["type"] {
  const value = `${String(role ?? "")} ${String(name ?? "")}`.toLowerCase();
  if (value.includes("thumbnail") || value.includes("thumb")) return "THUMBNAIL";
  if (value.includes("sub")) return "SUB";
  return "MAIN";
}

function normalizeCodec(value: unknown): CameraStreamProfile["codec"] {
  const codec = String(value ?? "UNKNOWN").toUpperCase();
  return codec === "H264" || codec === "H265" || codec === "AV1" || codec === "MJPEG"
    ? codec
    : "UNKNOWN";
}

function positiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function defaultBitrate(type: CameraStreamProfile["type"]): number {
  if (type === "THUMBNAIL") return 128;
  if (type === "SUB") return 512;
  return 2_048;
}
