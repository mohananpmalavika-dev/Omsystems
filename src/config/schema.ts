import { z } from "zod";

export const NodeEnvironmentSchema = z.enum(["development", "test", "production"]);

export const EnvironmentConfigSchema = z.object({
  NODE_ENV: NodeEnvironmentSchema.default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),

  // Core Authoritative Service Endpoints
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  CONTROL_API_URL: z.string().url("CONTROL_API_URL must be a valid URL").optional(),
  MEDIA_GATEWAY_URL: z.string().url("MEDIA_GATEWAY_URL must be a valid URL").optional(),
  RECORDING_ENGINE_URL: z.string().url("RECORDING_ENGINE_URL must be a valid URL").optional(),
  ANALYTICS_ENGINE_URL: z.string().url("ANALYTICS_ENGINE_URL must be a valid URL").optional(),
  NATS_URL: z.string().min(1, "NATS_URL must be valid").optional(),
  NATS_SERVERS: z.string().optional(),

  // MediaMTX / Streaming Configuration
  MEDIAMTX_API_URL: z.string().url().optional(),
  MEDIAMTX_HLS_URL: z.string().url().optional(),
  PUBLIC_HLS_BASE_URL: z.string().optional(),
  PUBLIC_WEBRTC_BASE_URL: z.string().optional(),

  // Security & TLS Configuration
  DATABASE_TLS_MODE: z.enum(["DISABLED", "VERIFY_CA", "VERIFY_FULL"]).optional(),
  DATABASE_CA_FILE: z.string().optional(),
  DATABASE_CA: z.string().optional(),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;
