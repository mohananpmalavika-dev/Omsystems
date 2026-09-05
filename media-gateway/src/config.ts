import { z } from "zod";

const serviceUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}, z.string().url());

const schema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  CONTROL_PLANE_URL: serviceUrl,
  MEDIA_GATEWAY_SHARED_KEY: z.string().min(32),
  MEDIAMTX_API_URL: z.string().url().default("http://localhost:9997"),
  MEDIAMTX_HLS_URL: z.string().url().default("http://localhost:8888"),
  MEDIAMTX_WEBRTC_URL: z.string().url().default("http://localhost:8889"),
  PUBLIC_HLS_BASE_URL: z.string().url().optional(),
  PUBLIC_WEBRTC_BASE_URL: z.string().url().optional(),
  MEDIA_ACCESS_TTL_SECONDS: z.coerce.number().int().min(30).max(86400).default(3600),
  STREAM_SECRETS_JSON: z.string().default("{}"),
  STREAM_SECRET_PROVIDER_URL: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url().optional(),
  ),
  STREAM_SECRET_PROVIDER_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  EDGE_BRIDGE_SHARED_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
});

export function loadMediaConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(environment);
  const streamSecrets = parseStreamSecrets(config.STREAM_SECRETS_JSON);
  if (environment.NODE_ENV === "production" &&
      !config.STREAM_SECRET_PROVIDER_URL &&
      Object.keys(streamSecrets).length === 0) {
    console.warn("[media-gateway] Running in production without STREAM_SECRET_PROVIDER_URL or STREAM_SECRETS_JSON; direct RTSP secret resolutions will return 503 stream_secret_unavailable.");
  }
  if (config.STREAM_SECRET_PROVIDER_URL && !config.STREAM_SECRET_PROVIDER_KEY) {
    throw new Error("STREAM_SECRET_PROVIDER_KEY is required with STREAM_SECRET_PROVIDER_URL");
  }
  return {
    ...config,
    PUBLIC_HLS_BASE_URL: config.PUBLIC_HLS_BASE_URL ?? "http://localhost:8888",
    PUBLIC_WEBRTC_BASE_URL: config.PUBLIC_WEBRTC_BASE_URL ?? "http://localhost:8889",
  };
}

function parseStreamSecrets(value: string): Record<string, string> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("STREAM_SECRETS_JSON must be a string-to-string object");
  }
  for (const [key, item] of Object.entries(parsed)) {
    if (typeof item !== "string" || !key) {
      throw new Error("STREAM_SECRETS_JSON must be a string-to-string object");
    }
  }
  return parsed as Record<string, string>;
}

export type MediaConfig = ReturnType<typeof loadMediaConfig>;
