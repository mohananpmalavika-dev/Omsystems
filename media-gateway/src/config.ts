import { z } from "zod";

const schema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  CONTROL_PLANE_URL: z.string().url(),
  MEDIA_GATEWAY_SHARED_KEY: z.string().min(32),
  MEDIAMTX_API_URL: z.string().url().default("http://localhost:9997"),
  MEDIAMTX_HLS_URL: z.string().url().default("http://localhost:8888"),
  PUBLIC_HLS_BASE_URL: z.string().url().default("http://localhost:8888"),
  PUBLIC_WEBRTC_BASE_URL: z.string().url().default("http://localhost:8889"),
  MEDIA_ACCESS_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
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
  if (config.STREAM_SECRET_PROVIDER_URL && !config.STREAM_SECRET_PROVIDER_KEY) {
    throw new Error("STREAM_SECRET_PROVIDER_KEY is required with STREAM_SECRET_PROVIDER_URL");
  }
  return config;
}

export type MediaConfig = ReturnType<typeof loadMediaConfig>;
