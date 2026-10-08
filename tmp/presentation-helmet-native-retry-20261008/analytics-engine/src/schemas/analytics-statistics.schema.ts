/**
 * Zod Schemas for Analytics Statistics API
 * Input validation and type safety
 */

import { z } from "zod";

/**
 * Allowed time bucket sizes
 */
export const bucketSchema = z.enum(["minute", "hour", "day", "week"]);

/**
 * Allowed severity levels
 */
export const severitySchema = z.enum(["P1", "P2", "P3", "P4", "P5"]);

/**
 * Allowed detection types (matches analytics_rules.detection_type constraint)
 */
export const detectionTypeSchema = z.enum([
  "motion",
  "person",
  "vehicle",
  "object",
  "line-crossing",
  "intrusion",
  "loitering",
  "crowd-density",
  "camera-tampering",
  "video-loss",
  "fire-smoke",
  "face",
  "anpr",
  "helmet",
  "fall",
  "tailgating",
  "queue",
]);

/**
 * HTTP query parameters for statistics endpoint
 */
export const statisticsQuerySchema = z.object({
  // Time range
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),

  // Bucket size
  bucket: bucketSchema.optional(),

  // Filters
  detectorType: z
    .union([detectionTypeSchema, z.array(detectionTypeSchema)])
    .optional(),
  severity: z.union([severitySchema, z.array(severitySchema)]).optional(),

  cameraId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),

  // Breakdown options
  includeTimeline: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true")
    .optional(),
  includeCameraBreakdown: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  includeBranchBreakdown: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),

  // Tenant (temporary - should come from auth)
  tenantId: z.string().uuid().optional(),
});

export type StatisticsQueryInput = z.infer<typeof statisticsQuerySchema>;
