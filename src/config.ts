import { z } from "zod";

const configSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  AUTH_MODE: z.enum(["development", "oidc"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  MEDIA_GATEWAY_SHARED_KEY: z.string().min(32).default(
    "development-media-gateway-key-change-me",
  ),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return configSchema.parse(environment);
}
