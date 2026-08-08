import { z } from "zod";

const schema = z.object({
  CONTROL_PLANE_URL: z.string().url(),
  BRANCH_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  EDGE_AGENT_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  EDGE_ACTIVATION_CODE: z.preprocess((value) => value === "" ? undefined : value, z.string().startsWith("sgact_").min(40).optional()),
  EDGE_AGENT_NAME: z.string().min(2),
  EDGE_AGENT_VERSION: z.string().default("0.1.1"),
  DEV_USER_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  CAMERA_USERNAME: z.string().default(""),
  CAMERA_PASSWORD: z.string().default(""),
  ONVIF_ENDPOINTS: z.string().default(""),
  AUTO_DISCOVERY_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  AUTO_DISCOVERY_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(15 * 60_000),
  DISCOVERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5000),
  ONVIF_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8000),
  FFPROBE_PATH: z.string().default("ffprobe"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  // RTSP network scanner settings: enable an active scan of the local LAN
  RTSP_SCAN_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  // Optional CIDR to scan (e.g. 192.168.1.0/24). If empty, the agent will infer local /24 networks.
  RTSP_SCAN_CIDR: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()).default(undefined),
  // Comma-separated list of ports to probe for RTSP
  RTSP_SCAN_PORTS: z.string().default("554,8554"),
  // Comma-separated list of common RTSP path suffixes to try
  RTSP_SCAN_PATHS: z.string().default("/,/stream,/h264,/live.sdp,/mpeg4,/Streaming/Channels/101,/cam/realmonitor?channel=1&subtype=1,/cam/realmonitor?channel=1&subtype=0"),
  // Concurrency for the active TCP/connect+probe scanner
  RTSP_SCAN_CONCURRENCY: z.coerce.number().int().min(1).max(500).default(50),
  // Timeout for individual RTSP probe/connect attempts (ms)
  RTSP_SCAN_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(3000),
  LIVE_MEDIA_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  EDGE_MANAGED_MEDIA_BOOTSTRAP: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  EDGE_LIVE_GATEWAY_HOST: z.string().default("127.0.0.1"),
  EDGE_LIVE_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  MEDIAMTX_PATH: z.string().default("mediamtx"),
  MEDIA_RUNTIME_MANAGED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  MEDIAMTX_API_URL: z.string().url().default("http://127.0.0.1:9997"),
  MEDIAMTX_HLS_URL: z.string().url().default("http://127.0.0.1:8888"),
  MEDIA_TUNNEL_MODE: z.enum(["disabled", "quick", "named"]).default("disabled"),
  CLOUDFLARED_PATH: z.string().default("cloudflared"),
  CLOUDFLARED_TUNNEL_TOKEN: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(20).optional(),
  ),
  MEDIA_ACCESS_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  CAMERA_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(30_000),
  CAMERA_CONFIG_REFRESH_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),
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
  EDGE_IDENTITY_PATH: z.string().default("./data/device-identity.enc"),
  EDGE_IDENTITY_KEY_PATH: z.string().default("./data/device-identity.key"),
  EDGE_OFFLINE_OUTBOX_PATH: z.string().default("./data/offline-outbox.enc"),
  EDGE_OFFLINE_OUTBOX_KEY_PATH: z.string().default("./data/offline-outbox.key"),
  EDGE_OFFLINE_OUTBOX_MAX_ITEMS: z.coerce.number().int().min(100).max(100_000).default(10_000),
  EDGE_CAMERA_CREDENTIAL_VAULT_PATH: z.string().default("./data/camera-credentials.enc"),
  EDGE_CAMERA_CREDENTIAL_VAULT_KEY_PATH: z.string().default("./data/camera-credentials.key"),
  EDGE_UPDATE_PUBLIC_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().min(64).optional()),
  EDGE_UPDATE_STAGING_PATH: z.string().default("./data/updates"),
  CONTROL_PLANE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  EDGE_LOG_PATH: z.string().min(1).default("./logs/edge-agent.log"),
  INTERNET_LINKS_JSON: z.string().default("[]").transform((value, context) => {
    try { return JSON.parse(value) as unknown; } catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "INTERNET_LINKS_JSON must be valid JSON" }); return z.NEVER; }
  }).pipe(z.array(z.object({
    id: z.string().min(1), role: z.enum(["primary", "backup"]), ispName: z.string().min(1),
    interfaceName: z.string().min(1).optional(), sourceAddress: z.string().min(1).optional(),
    targets: z.array(z.string().url()).min(1),
    gatewayAddress: z.string().min(1).optional(),
    publicIpEndpoint: z.string().url().optional(),
    contractedDownMbps: z.number().positive().optional(), contractedUpMbps: z.number().positive().optional(),
  })).max(4)),
  INTERNET_PROBE_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(3000),
  INTERNET_PROBE_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  INTERNET_PATH_WINDOW_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(300_000),
  EDGE_HEALTH_DISK_PATH: z.string().min(1).default("."),
  RECORDERS_JSON: z.string().default("[]").transform((value, context) => {
    try { return JSON.parse(value) as unknown; } catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "RECORDERS_JSON must be valid JSON" }); return z.NEVER; }
  }).pipe(z.array(z.object({
    id: z.string().min(1).max(80), name: z.string().min(1), deviceType: z.enum(["dvr", "nvr"]),
    vendor: z.enum(["hikvision", "dahua", "cp-plus", "onvif", "generic"]),
    model: z.string().optional(), host: z.string().min(1), port: z.number().int().min(1).max(65535),
    rtspPort: z.number().int().min(1).max(65535).optional(),
    secure: z.boolean().optional(), username: z.string().optional(), password: z.string().optional(),
    systemPath: z.string().startsWith("/").optional(), storagePath: z.string().startsWith("/").optional(),
    // Maps recorder-native channel numbers to approved control-plane camera IDs.
    // The mapping is deliberately explicit: a branch can have more than one
    // recorder, so a camera's display channel alone is not a safe association.
    archiveRetention: z.object({
      lookbackDays: z.number().int().min(1).max(3650).default(400),
      maxResults: z.number().int().min(100).max(1_000_000).default(500_000),
      // Use a value no greater than the branch policy's allowed gap. A smaller
      // value is conservative and remains valid for a less strict policy.
      continuityGapSeconds: z.number().int().min(0).max(86_400).default(30),
      verifyPlayback: z.boolean().default(true),
      channels: z.array(z.object({
        cameraId: z.string().min(1).max(200),
        channel: z.number().int().min(0).max(65_535),
      })).min(1).max(128).superRefine((channels, context) => {
        const cameraIds = new Set<string>();
        const channelIds = new Set<number>();
        channels.forEach((item, index) => {
          if (cameraIds.has(item.cameraId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "cameraId"], message: "Each cameraId may be mapped once per recorder" });
          if (channelIds.has(item.channel)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "channel"], message: "Each recorder channel may be mapped once" });
          cameraIds.add(item.cameraId);
          channelIds.add(item.channel);
        });
      }),
    }).optional(),
  })).max(128)),
  RECORDER_POLL_INTERVAL_MS: z.coerce.number().int().min(5000).max(3_600_000).default(30000),
  RECORDER_PROBE_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5000),
  RECORDER_ARCHIVE_SCAN_INTERVAL_MS: z.coerce.number().int().min(60_000).max(7 * 86_400_000).default(6 * 3_600_000),
  // Database credential provider
  DATABASE_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  USE_DATABASE_CREDENTIALS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
}).superRefine((value, context) => {
  if (value.EDGE_BRIDGE_SHARED_KEY && !value.EDGE_AGENT_ID) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["EDGE_AGENT_ID"],
      message: "EDGE_AGENT_ID is required with EDGE_BRIDGE_SHARED_KEY; download a branch-specific package from the dashboard",
    });
  }
  if (!value.EDGE_ACTIVATION_CODE && !(value.BRANCH_ID && value.EDGE_AGENT_ID && value.EDGE_BRIDGE_SHARED_KEY) && !value.DEV_USER_ID) {
    context.addIssue({
      code: z.ZodIssueCode.custom, path: ["EDGE_ACTIVATION_CODE"],
      message: "Provide a one-time EDGE_ACTIVATION_CODE, or an existing legacy/development identity",
    });
  }
  if (value.LIVE_MEDIA_ENABLED && value.MEDIA_TUNNEL_MODE === "disabled" && !value.PUBLIC_MEDIA_GATEWAY_URL) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["PUBLIC_MEDIA_GATEWAY_URL"], message: "Live media without a tunnel requires a reachable PUBLIC_MEDIA_GATEWAY_URL" });
  }
  if (value.LIVE_MEDIA_ENABLED && value.MEDIA_TUNNEL_MODE === "named" &&
      !value.EDGE_MANAGED_MEDIA_BOOTSTRAP &&
      (!value.CLOUDFLARED_TUNNEL_TOKEN || !value.PUBLIC_MEDIA_GATEWAY_URL)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["CLOUDFLARED_TUNNEL_TOKEN"], message: "Named media tunnels require CLOUDFLARED_TUNNEL_TOKEN and PUBLIC_MEDIA_GATEWAY_URL" });
  }
});

export function loadEdgeConfig(environment: NodeJS.ProcessEnv = process.env) {
  return schema.parse(environment);
}

export type EdgeConfig = ReturnType<typeof loadEdgeConfig>;
