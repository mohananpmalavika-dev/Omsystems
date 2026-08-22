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
  AUTH_MODE: z.enum(["development", "session", "oidc"]),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  EDGE_PRESENCE_TTL_SECONDS: z.coerce.number().int().min(15).max(600).default(90),
  EDGE_MANAGED_TUNNEL_REQUIRED: z.enum(["true", "false"]).default("false")
    .transform((value) => value === "true"),
  CLOUDFLARE_ACCOUNT_ID: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().regex(/^[a-f0-9]{32}$/i).optional(),
  ),
  CLOUDFLARE_ZONE_ID: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().regex(/^[a-f0-9]{32}$/i).optional(),
  ),
  CLOUDFLARE_API_TOKEN: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(20).optional(),
  ),
  EDGE_MEDIA_BASE_DOMAIN: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i).optional(),
  ),
  MEDIA_GATEWAY_SHARED_KEY: z.string().min(32),
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
  ANALYTICS_SOURCE_SHARED_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  EDGE_LEGACY_SHARED_KEY_ENABLED: z.enum(["true", "false"]).default("false")
    .transform((value) => value === "true"),
  EDGE_UPDATE_SIGNING_PRIVATE_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(64).optional(),
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
  REPORT_DOWNLOAD_SECRET: z.string().min(32),
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
  if (config.EDGE_MANAGED_TUNNEL_REQUIRED && !(
    config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_ZONE_ID &&
    config.CLOUDFLARE_API_TOKEN && config.EDGE_MEDIA_BASE_DOMAIN
  )) {
    context.addIssue({
      code: "custom",
      path: ["EDGE_MANAGED_TUNNEL_REQUIRED"],
      message: "Managed branch tunnels require CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN, and EDGE_MEDIA_BASE_DOMAIN",
    });
  }
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const expanded = { ...environment };
  for (const name of ["DATABASE_URL", "REDIS_URL", "MEDIA_GATEWAY_SHARED_KEY", "EDGE_BRIDGE_SHARED_KEY", "EDGE_UPDATE_SIGNING_PRIVATE_KEY", "RECORDING_ENGINE_SHARED_KEY", "ANALYTICS_ENGINE_SHARED_KEY", "ANALYTICS_SOURCE_SHARED_KEY", "FEDERATION_SHARED_KEY", "REPORT_DOWNLOAD_SECRET", "REPORT_WORKER_SHARED_KEY", "CLOUDFLARE_API_TOKEN"] as const) {
    const file = environment[`${name}_FILE`];
    if (file && environment[name]) throw new Error(`${name} and ${name}_FILE cannot both be set`);
    if (file) expanded[name] = readFileSync(file, "utf8").trim();
  }
  return configSchema.parse(expanded);
}
