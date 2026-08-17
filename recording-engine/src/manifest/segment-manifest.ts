import { z } from "zod";

export const keyframeIndexEntrySchema = z.object({
  pts: z.number(),
  wallClock: z.string(),
  offset: z.number(),
});

export type KeyframeIndexEntry = z.infer<typeof keyframeIndexEntrySchema>;

export const segmentStateSchema = z.enum([
  "CREATING",
  "WRITING",
  "CLOSING",
  "VALIDATING",
  "HASHING",
  "INDEX_PENDING",
  "AVAILABLE",
  "INCOMPLETE",
  "CORRUPT",
  "QUARANTINED",
]);

export type SegmentState = z.infer<typeof segmentStateSchema>;

export const segmentHealthSchema = z.enum([
  "HEALTHY",
  "CORRUPT",
  "INCOMPLETE",
  "QUARANTINED",
  "MISSING",
]);

export type SegmentHealth = z.infer<typeof segmentHealthSchema>;

export const segmentManifestSchema = z.object({
  version: z.literal(1).default(1),
  segmentId: z.string().min(1),
  tenantId: z.string().min(1),
  branchId: z.string().min(1),
  cameraId: z.string().min(1),
  streamId: z.string().default("main"),
  jobId: z.string().min(1),
  storageNode: z.string().min(1),
  storagePath: z.string().min(1),
  mediaFormat: z.enum(["mkv", "mp4"]).default("mkv"),

  // System & Media Timestamps
  systemStart: z.string().datetime(),
  systemEnd: z.string().datetime(),
  sourceStart: z.string().datetime().optional(),
  sourceEnd: z.string().datetime().optional(),
  clockOffsetMs: z.number().default(0),

  // Media timings
  firstPts: z.number().optional(),
  lastPts: z.number().optional(),
  firstDts: z.number().optional(),
  lastDts: z.number().optional(),
  timeBase: z.string().optional(),
  timestampHealth: z.enum(["HEALTHY", "DRIFTING", "DISCONTINUITY", "REGRESSION"]).default("HEALTHY"),

  // Codec & video details
  codec: z.string().default("h264"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  durationMs: z.number().nonnegative(),
  sizeBytes: z.number().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),

  // Keyframe details
  keyframeCount: z.number().int().nonnegative().default(0),
  keyframes: z.array(keyframeIndexEntrySchema).default([]),

  // State & Health
  state: segmentStateSchema.default("AVAILABLE"),
  health: segmentHealthSchema.default("HEALTHY"),
  finalizedAt: z.string().datetime().optional(),
});

export type SegmentManifest = z.infer<typeof segmentManifestSchema>;

export function createSegmentManifest(input: Partial<SegmentManifest> & {
  segmentId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  jobId: string;
  storageNode: string;
  storagePath: string;
  systemStart: string;
  systemEnd: string;
  durationMs: number;
  sizeBytes: number;
}): SegmentManifest {
  return segmentManifestSchema.parse({
    version: 1,
    streamId: "main",
    mediaFormat: "mkv",
    clockOffsetMs: 0,
    timestampHealth: "HEALTHY",
    codec: "h264",
    keyframeCount: input.keyframes ? input.keyframes.length : 0,
    keyframes: [],
    state: "AVAILABLE",
    health: "HEALTHY",
    ...input,
  });
}
