import { z } from "zod";

const schema = z.object({
  CONTROL_PLANE_URL: z.string().url(),
  BRANCH_ID: z.string().min(1),
  EDGE_AGENT_ID: z.string().min(1).optional(),
  EDGE_AGENT_NAME: z.string().min(2),
  EDGE_AGENT_VERSION: z.string().default("0.1.0"),
  DEV_USER_ID: z.string().min(1).default("user-global-admin"),
  CAMERA_USERNAME: z.string().min(1).default("admin"),
  CAMERA_PASSWORD: z.string().default(""),
  ONVIF_ENDPOINTS: z.string().default(""),
  DISCOVERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5000),
  ONVIF_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8000),
  FFPROBE_PATH: z.string().default("ffprobe"),
  PUBLIC_MEDIA_GATEWAY_URL: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url().optional(),
  ),
  STREAM_SECRET_STORE_PATH: z.string().default("./data/stream-secrets.json"),
  STREAM_SECRET_PROVIDER_HOST: z.string().default("127.0.0.1"),
  STREAM_SECRET_PROVIDER_PORT: z.coerce.number().int().min(1).max(65535).default(8093),
  EDGE_MEDIA_SHARED_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  EDGE_BRIDGE_SHARED_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  INTERNET_LINKS_JSON: z.string().default("[]").transform((value, context) => {
    try { return JSON.parse(value) as unknown; } catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "INTERNET_LINKS_JSON must be valid JSON" }); return z.NEVER; }
  }).pipe(z.array(z.object({
    id: z.string().min(1), role: z.enum(["primary", "backup"]), ispName: z.string().min(1),
    interfaceName: z.string().min(1).optional(), targets: z.array(z.string().url()).min(1),
    contractedDownMbps: z.number().positive().optional(), contractedUpMbps: z.number().positive().optional(),
  })).max(4)),
  INTERNET_PROBE_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(3000),
  INTERNET_PROBE_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  RECORDERS_JSON: z.string().default("[]").transform((value, context) => {
    try { return JSON.parse(value) as unknown; } catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "RECORDERS_JSON must be valid JSON" }); return z.NEVER; }
  }).pipe(z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), deviceType: z.enum(["dvr", "nvr"]),
    vendor: z.enum(["hikvision", "dahua", "cp-plus", "onvif", "generic"]),
    model: z.string().optional(), host: z.string().min(1), port: z.number().int().min(1).max(65535),
    secure: z.boolean().optional(), username: z.string().optional(), password: z.string().optional(),
    systemPath: z.string().startsWith("/").optional(), storagePath: z.string().startsWith("/").optional(),
  })).max(128)),
  RECORDER_POLL_INTERVAL_MS: z.coerce.number().int().min(5000).max(3_600_000).default(30000),
  RECORDER_PROBE_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5000),
});

export function loadEdgeConfig(environment: NodeJS.ProcessEnv = process.env) {
  return schema.parse(environment);
}

export type EdgeConfig = ReturnType<typeof loadEdgeConfig>;
