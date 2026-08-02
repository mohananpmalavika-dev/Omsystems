import { z } from "zod";
import { readFileSync } from "node:fs";

const optionalServiceUrl = z.preprocess((value) => {
  if (value === "" || value === undefined) return undefined;
  if (typeof value !== "string") return value;
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}, z.string().url().optional());

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  AUTH_MODE: z.enum(["development", "session", "oidc"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  MEDIA_GATEWAY_SHARED_KEY: z.string().min(32).default(
    "development-media-gateway-key-change-me",
  ),
  EDGE_BRIDGE_SHARED_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  RECORDING_ENGINE_URL: optionalServiceUrl,
  RECORDING_ENGINE_SHARED_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  ANALYTICS_ENGINE_SHARED_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  CONTROL_PLANE_PUBLIC_URL: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url().optional(),
  ),
  ANALYTICS_ENGINE_URL: optionalServiceUrl,
  FEDERATION_SHARED_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  FEDERATION_PEER_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8_000),
  FEDERATION_HEARTBEAT_TTL_SECONDS: z.coerce.number().int().min(15).max(3_600).default(90),
  REPORT_DOWNLOAD_SECRET: z.string().min(32).default("development-report-download-secret-change-me"),
  REPORT_WORKER_SHARED_KEY: z.string().min(32).optional(),
  MAX_IN_FLIGHT_REQUESTS: z.coerce.number().int().min(10).max(10_000).default(500),
}).superRefine((config, context) => {
  if (config.NODE_ENV !== "production") return;
  if (config.AUTH_MODE === "development") context.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "development authentication is forbidden in production" });
  for (const [name, value] of Object.entries(config)) {
    if (typeof value === "string" && /development|change-me|local-development-only/i.test(value)) {
      context.addIssue({ code: "custom", path: [name], message: "placeholder secret/value is forbidden in production" });
    }
  }
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const expanded = { ...environment };
  for (const name of ["DATABASE_URL", "MEDIA_GATEWAY_SHARED_KEY", "EDGE_BRIDGE_SHARED_KEY", "RECORDING_ENGINE_SHARED_KEY", "ANALYTICS_ENGINE_SHARED_KEY", "FEDERATION_SHARED_KEY", "REPORT_DOWNLOAD_SECRET", "REPORT_WORKER_SHARED_KEY"] as const) {
    const file = environment[`${name}_FILE`];
    if (file && environment[name]) throw new Error(`${name} and ${name}_FILE cannot both be set`);
    if (file) expanded[name] = readFileSync(file, "utf8").trim();
  }
  return configSchema.parse(expanded);
}
