import { z } from "zod";

const schema = z.object({
  CONTROL_PLANE_URL: z.string().url(),
  BRANCH_ID: z.string().min(1),
  EDGE_AGENT_NAME: z.string().min(2),
  EDGE_AGENT_VERSION: z.string().default("0.1.0"),
  DEV_USER_ID: z.string().min(1),
  CAMERA_USERNAME: z.string().min(1),
  CAMERA_PASSWORD: z.string().default(""),
  ONVIF_ENDPOINTS: z.string().default(""),
  DISCOVERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5000),
  ONVIF_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8000),
  FFPROBE_PATH: z.string().default("ffprobe"),
});

export function loadEdgeConfig(environment: NodeJS.ProcessEnv = process.env) {
  return schema.parse(environment);
}

export type EdgeConfig = ReturnType<typeof loadEdgeConfig>;
