import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { SESClient } from "@aws-sdk/client-ses";
import {
  hasExtendedInfrastructure,
  type CameraDiscoveryInput,
  type ControlPlaneStore,
} from "./control-plane-store.js";
import { actions, type Action, type Camera, type RecordingJob } from "./domain/models.js";
import { createAuthMiddleware, RateLimiter } from "./middleware/auth.middleware.js";
import { buildPlaybackTimeline } from "./recording/playback-timeline.js";
import { calculateRecordingStorage } from "./recording/storage-calculator.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCameraPermissionRoutes } from "./routes/camera-permissions.routes.js";
import { registerCameraDiscoveryRoutes } from "./routes/camera-discovery.routes.js";
import { registerCctvInfrastructureRoutes } from "./routes/cctv-infrastructure.js";
import { registerOrganizationRoutes } from "./routes/organization.routes.js";
import { registerUserRoutes } from "./routes/user.routes.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerReportsRoutes } from "./routes/reports.routes.js";
import { registerLiveOperationsRoutes } from "./routes/live-operations.routes.js";
import { registerDashboardRoutes } from "./routes/dashboard.routes.js";
import { registerAnalyticsPhase2Routes } from "./routes/analytics-phase2.routes.js";
import { adminCameraManagementRoutes } from "./routes/admin-camera-management.routes.js";
import { registerIncidentsRoutes } from "./routes/incidents.routes.js";
import { registerComplianceRoutes } from "./routes/compliance.routes.js";
import { registerComplianceEnhancedRoutes } from "./routes/compliance-enhanced.routes.js";
import { registerPrivacyRoutes } from "./routes/privacy.routes.js";
import { registerMaintenanceRoutes } from "./routes/maintenance.routes.js";
import { registerMaintenanceDashboardRoutes } from "./routes/maintenance-dashboard.routes.js";
import { registerMaintenanceAdvancedRoutes } from "./routes/maintenance-advanced.routes.js";
import { registerMaintenanceHealthRoutes } from "./routes/maintenance-health.routes.js";
import { registerMaintenanceReportsRoutes } from "./routes/maintenance-reports.routes.js";
import { registerMaintenanceExportRoutes } from "./routes/maintenance-export.routes.js";
import { registerFirmwareManagementRoutes } from "./routes/maintenance-firmware.routes.js";
import { registerPredictiveAnalyticsRoutes } from "./routes/maintenance-predictive.routes.js";
import { registerEvidenceRoutes } from "./routes/evidence.routes.js";
import { registerVideoSearchRoutes } from "./routes/video-search.routes.js";
import { registerDeviceInventoryRoutes } from "./routes/device-inventory.routes.js";
import { registerDeviceManagementRoutes } from "./routes/device-management.routes.js";
import { registerDVRNVRMonitorRoutes } from "./routes/dvr-nvr-monitor.routes.js";
import { registerEdgeAgentPackageRoutes } from "./routes/edge-agent-package.routes.js";
import { registerOperationalHealthRoutes } from "./routes/operational-health.routes.js";
import { registerVideoWallRoutes } from "./routes/video-wall.routes.js";
import { registerAlertCommandCenterRoutes } from "./routes/alert-command-center.routes.js";
import { registerCommandCenterRoutes } from "./routes/command-center.routes.js";
import { registerDigitalTwinRoutes } from "./routes/digital-twin.routes.js";
import { registerOperationalReportRoutes } from "./routes/operational-reports.routes.js";
import { registerFederationRoutes } from "./routes/federation.routes.js";
import {
  EmptyFederationLocalSearchProvider,
  FederationManager,
  HttpFederationPeerClient,
  type FederationLocalSearchProvider,
} from "./federation/manager.js";
import {
  MemoryFederationRepository,
  PostgresFederationRepository,
} from "./federation/repository.js";
import { RecordingFederationSearchProvider } from "./federation/recording-search-provider.js";
import {
  AlertNotificationDispatcher,
  HttpAlertNotificationSender,
  ProviderFailoverAlertNotificationSender,
  type AlertNotificationSender,
  type NotificationProviderTarget,
} from "./alerts/notification-dispatcher.js";
import {
  ExotelVoiceProvider, RoutedAlertNotificationSender, TwilioVoiceProvider,
  VoiceCallbackTokens, VoiceCallNotificationSender,
} from "./alerts/voice-call.js";
import { Msg91SmsProvider, SmsNotificationSender, TextLocalSmsProvider, TwilioSmsProvider } from "./alerts/sms.js";
import {
  HttpAlertEvidenceClient,
  type AlertEvidenceClient,
} from "./alerts/evidence-capture.js";
import {
  HttpOperationalReportEmailSender,
  OperationalReportWorker,
  ProviderOperationalReportEmailSender,
  type OperationalReportEmailSender,
} from "./reporting/worker.js";
import { EmailNotificationSender, NodemailerSmtpProvider, SendGridEmailProvider, SesEmailProvider } from "./alerts/email.js";
import { DVRNVRMonitorService } from "./services/dvr-nvr-monitor.service.js";
import { parseBulkCameraCsv } from "./services/camera-registration.js";
import { RecordingSearchService } from "./recording/search-service.js";
import { PlaybackEngine } from "./recording/playback-engine.js";
import { SnapshotService } from "./recording/snapshot-service.js";
import { ExportWorker } from "./recording/export-worker.js";
import { ForensicAnalyzer } from "./recording/forensic-analyzer.js";
import { MemoryStore } from "./store.js";
import { RuntimeGuard } from "./platform/runtime-guard.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: Awaited<ReturnType<ControlPlaneStore["getUser"]>> & {};
    edgeAgentAuthenticated: boolean;
  }
}

const idParams = z.object({ id: z.string().min(1) });
const branchParams = z.object({ branchId: z.string().min(1) });
const edgeAgentParams = z.object({ id: z.string().min(1) });
const edgeScanParams = z.object({ id: z.string().min(1), jobId: z.string().min(1) });
const branchListQuery = z.object({
  action: z.enum(actions).default("live:view"),
});
const cameraStatusSchema = z.object({
  status: z.enum(["online", "offline", "degraded", "unknown"]),
});
const cameraProfileSchema = z.object({
  name: z.string().min(1),
  codec: z.enum(["H264", "H265", "MJPEG", "unknown"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  rtspUri: z.string().min(1).optional(),
}).strict();
const capabilitiesSchema = z.object({
  ptz: z.boolean(),
  audio: z.boolean(),
  events: z.boolean(),
});
const onvifCapabilityTestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.enum(["pass", "fail", "unsupported", "vendor-specific"]),
  detail: z.string().trim().max(500).optional(),
}).strict();
const scheduleWindowSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  enabled: z.boolean().default(true),
});
const scheduleExceptionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  enabled: z.boolean().default(false),
  description: z.string().trim().min(1).max(1_000).optional(),
});
const recordingScheduleSchema = z.object({
  timezone: z.string().trim().min(1).max(100).default("UTC"),
  windows: z.array(scheduleWindowSchema).min(1),
  exceptions: z.array(scheduleExceptionSchema).optional(),
});
const recordingJobSchema = z.object({
  mode: z.enum(["continuous", "motion", "scheduled", "event", "manual"]),
  enabled: z.boolean().default(true),
  retentionDays: z.number().int().min(1).max(3650).default(180),
  schedule: recordingScheduleSchema.optional(),
  preRollSeconds: z.number().int().min(0).max(3600).default(30),
  postRollSeconds: z.number().int().min(0).max(3600).default(30),
  minMotionDurationSeconds: z.number().int().min(0).max(86_400).default(0),
  motionConfidenceThreshold: z.number().min(0).max(1).default(0),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(60),
  maxEventDurationSeconds: z.number().int().min(0).max(86_400).default(0),
  segmentDurationSeconds: z.number().int().min(10).max(300).default(60),
  hotRetentionDays: z.number().int().min(0).max(3650).default(30),
  warmRetentionDays: z.number().int().min(0).max(3650).default(60),
  coldRetentionDays: z.number().int().min(0).max(3650).default(90),
  maxBitrateKbps: z.number().int().min(64).max(100_000).optional(),
  storageNodeExternalId: z.string().min(1).max(200).optional(),
  triggerEventTypes: z.array(z.string().trim().min(1).max(100)).optional(),
  critical: z.boolean().default(false),
  backupRequired: z.boolean().default(false),
  automaticDeletionEnabled: z.boolean().default(true),
  evidenceProtection: z.boolean().default(true),
  recordMainStream: z.boolean().default(true),
});

const storageCalculatorSchema = z.object({
  cameraCount: z.number().int().min(1).max(100_000),
  bitrateMbps: z.number().positive().max(1_000),
  recordingHoursPerDay: z.number().positive().max(24).default(24),
  retentionDays: z.number().int().min(1).max(3650).default(180),
  metadataAndIndexPercent: z.number().min(0).max(100).default(15),
  safetyReservePercent: z.number().min(0).max(100).default(0),
  raidUsablePercent: z.number().min(10).max(100).default(75),
  backupCopies: z.number().int().min(0).max(10).default(1),
});

const internalSegmentSchema = z.object({
  tenantId: z.string().min(1), cameraId: z.string().min(1), jobId: z.string().min(1),
  startedAt: z.string().datetime(), endedAt: z.string().datetime(),
  storagePath: z.string().min(1).max(2_000), sizeBytes: z.number().int().nonnegative(),
  storageNodeExternalId: z.string().min(1).max(200),
  storageTier: z.enum(["hot", "warm", "cold"]).default("hot"),
  status: z.enum(["ready", "moving", "deleted", "error"]).default("ready"),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  codec: z.string().max(50).optional(),
});

function configuredReportEmailSender(downloadSecret: string): OperationalReportEmailSender {
  const provider = process.env.REPORT_EMAIL_PROVIDER?.trim().toLowerCase()
    ?? (process.env.REPORT_EMAIL_WEBHOOK_URL ? "webhook" : undefined);
  const publicBaseUrl = (process.env.REPORT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const from = process.env.REPORT_EMAIL_FROM ?? "reports@example.com";
  const requirePublicBaseUrl = () => {
    if (!/^https:\/\//i.test(publicBaseUrl)) {
      throw new Error("REPORT_PUBLIC_BASE_URL must be a provider-reachable HTTPS URL when report email delivery is enabled");
    }
  };

  if (provider === "smtp") {
    if (!process.env.REPORT_SMTP_URL) throw new Error("REPORT_SMTP_URL is required for REPORT_EMAIL_PROVIDER=smtp");
    requirePublicBaseUrl();
    return new ProviderOperationalReportEmailSender(
      new NodemailerSmtpProvider({ url: process.env.REPORT_SMTP_URL, from }), publicBaseUrl, downloadSecret,
    );
  }
  if (provider === "sendgrid") {
    const apiKey = process.env.REPORT_SENDGRID_API_KEY ?? process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new Error("REPORT_SENDGRID_API_KEY is required for REPORT_EMAIL_PROVIDER=sendgrid");
    requirePublicBaseUrl();
    return new ProviderOperationalReportEmailSender(new SendGridEmailProvider(apiKey, fetch, from), publicBaseUrl, downloadSecret);
  }
  if (provider === "ses") {
    const region = process.env.REPORT_AWS_REGION ?? process.env.AWS_REGION;
    if (!region) throw new Error("REPORT_AWS_REGION or AWS_REGION is required for REPORT_EMAIL_PROVIDER=ses");
    requirePublicBaseUrl();
    return new ProviderOperationalReportEmailSender(new SesEmailProvider(new SESClient({ region }), from), publicBaseUrl, downloadSecret);
  }
  if (provider === "webhook") {
    if (!process.env.REPORT_EMAIL_WEBHOOK_URL) throw new Error("REPORT_EMAIL_WEBHOOK_URL is required for REPORT_EMAIL_PROVIDER=webhook");
    requirePublicBaseUrl();
    return new HttpOperationalReportEmailSender(
      process.env.REPORT_EMAIL_WEBHOOK_URL, process.env.REPORT_EMAIL_PROVIDER_TOKEN, publicBaseUrl, downloadSecret,
    );
  }
  if (provider) throw new Error(`Unsupported REPORT_EMAIL_PROVIDER=${provider}`);
  return new HttpOperationalReportEmailSender(undefined, undefined, publicBaseUrl, downloadSecret);
}

type AlertProviderDependencies = {
  fetcher?: typeof fetch;
  createSesClient?: (region: string) => { send(command: unknown): Promise<unknown> };
};

export function configuredAlertEmailTargets(
  store: ControlPlaneStore,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: AlertProviderDependencies = {},
): NotificationProviderTarget[] {
  return alertProviderNames(environment.ALERT_EMAIL_PROVIDER, environment.ALERT_EMAIL_FAILOVER_PROVIDER)
    .map((name) => {
      const from = environment.ALERT_EMAIL_FROM;
      if (name === "smtp") {
        if (!environment.ALERT_SMTP_URL) throw new Error("ALERT_SMTP_URL is required for ALERT_EMAIL_PROVIDER=smtp");
        const provider = new NodemailerSmtpProvider({ url: environment.ALERT_SMTP_URL, from });
        return { name, sender: new EmailNotificationSender(store, provider) };
      }
      if (name === "sendgrid") {
        const apiKey = environment.ALERT_SENDGRID_API_KEY ?? environment.SENDGRID_API_KEY;
        if (!apiKey) throw new Error("ALERT_SENDGRID_API_KEY or SENDGRID_API_KEY is required for ALERT_EMAIL_PROVIDER=sendgrid");
        const provider = new SendGridEmailProvider(apiKey, dependencies.fetcher ?? fetch, from);
        return { name, sender: new EmailNotificationSender(store, provider) };
      }
      if (name === "ses") {
        const region = environment.ALERT_AWS_REGION ?? environment.AWS_REGION;
        if (!region) throw new Error("ALERT_AWS_REGION or AWS_REGION is required for ALERT_EMAIL_PROVIDER=ses");
        if (!from || !from.includes("@")) throw new Error("ALERT_EMAIL_FROM is required for ALERT_EMAIL_PROVIDER=ses");
        const client = dependencies.createSesClient?.(region) ?? new SESClient({ region });
        return { name, sender: new EmailNotificationSender(store, new SesEmailProvider(client, from)) };
      }
      throw new Error(`Unsupported ALERT_EMAIL_PROVIDER=${name}`);
    });
}

function configuredAlertSmsTargets(
  store: ControlPlaneStore,
  publicBaseUrl: string,
  voiceTokens: VoiceCallbackTokens,
  environment: NodeJS.ProcessEnv = process.env,
): NotificationProviderTarget[] {
  return alertProviderNames(environment.ALERT_SMS_PROVIDER, environment.ALERT_SMS_FAILOVER_PROVIDER)
    .map((name) => {
      if (name === "msg91" && environment.MSG91_AUTH_KEY) {
        return { name, sender: new SmsNotificationSender(store,
          new Msg91SmsProvider(environment.MSG91_AUTH_KEY), publicBaseUrl, voiceTokens) };
      }
      if (name === "textlocal" && environment.TEXTLOCAL_API_KEY && environment.TEXTLOCAL_SENDER_ID) {
        return { name, sender: new SmsNotificationSender(store,
          new TextLocalSmsProvider(environment.TEXTLOCAL_API_KEY, environment.TEXTLOCAL_SENDER_ID), publicBaseUrl, voiceTokens) };
      }
      if (name === "twilio" && environment.TWILIO_ACCOUNT_SID && environment.TWILIO_AUTH_TOKEN &&
          (environment.TWILIO_SMS_FROM_NUMBER || environment.SMS_FROM)) {
        return { name, sender: new SmsNotificationSender(store,
          new TwilioSmsProvider(environment.TWILIO_ACCOUNT_SID, environment.TWILIO_AUTH_TOKEN,
            environment.TWILIO_SMS_FROM_NUMBER ?? environment.SMS_FROM!), publicBaseUrl, voiceTokens) };
      }
      throw new Error(`Incomplete credentials for ALERT_SMS_PROVIDER=${name}`);
    });
}

function configuredAlertVoiceTargets(
  store: ControlPlaneStore,
  publicBaseUrl: string,
  voiceTokens: VoiceCallbackTokens,
  environment: NodeJS.ProcessEnv = process.env,
): NotificationProviderTarget[] {
  return alertProviderNames(environment.ALERT_VOICE_PROVIDER, environment.ALERT_VOICE_FAILOVER_PROVIDER)
    .map((name) => {
      if (name === "twilio" && environment.TWILIO_ACCOUNT_SID && environment.TWILIO_AUTH_TOKEN && environment.TWILIO_FROM_NUMBER) {
        return { name, sender: new VoiceCallNotificationSender(store,
          new TwilioVoiceProvider(environment.TWILIO_ACCOUNT_SID, environment.TWILIO_AUTH_TOKEN,
            environment.TWILIO_FROM_NUMBER), publicBaseUrl, voiceTokens) };
      }
      if (name === "exotel" && environment.EXOTEL_ACCOUNT_SID && environment.EXOTEL_API_KEY &&
          environment.EXOTEL_API_TOKEN && environment.EXOTEL_CALLER_ID) {
        return { name, sender: new VoiceCallNotificationSender(store,
          new ExotelVoiceProvider(environment.EXOTEL_ACCOUNT_SID, environment.EXOTEL_API_KEY,
            environment.EXOTEL_API_TOKEN, environment.EXOTEL_CALLER_ID,
            environment.EXOTEL_SUBDOMAIN), publicBaseUrl, voiceTokens) };
      }
      throw new Error(`Incomplete credentials for ALERT_VOICE_PROVIDER=${name}`);
    });
}

function alertProviderNames(primary: string | undefined, failover: string | undefined) {
  return [...new Set([primary, failover].filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase()))];
}

function providerSender(store: ControlPlaneStore, targets: NotificationProviderTarget[]) {
  if (targets.length === 0) return undefined;
  return targets.length === 1 ? targets[0]!.sender : new ProviderFailoverAlertNotificationSender(store, targets);
}

export async function buildApp(options?: {
  logger?: boolean;
  store?: ControlPlaneStore;
  mediaGatewaySharedKey?: string;
  recordingEngineUrl?: string;
  recordingEngineSharedKey?: string;
  edgeBridgeSharedKey?: string;
  analyticsEngineSharedKey?: string;
  analyticsEngineUrl?: string;
  authMode?: "development" | "session" | "oidc";
  recordingRoot?: string;
  controlPlanePublicUrl?: string;
  edgeAgentArtifactRoot?: string;
  enableExportWorker?: boolean;
  alertWorkerKey?: string;
  alertNotificationSender?: AlertNotificationSender;
  alertEvidenceClient?: AlertEvidenceClient;
  voiceCallbackSecret?: string;
  reportExportRoot?: string;
  reportDownloadSecret?: string;
  reportWorkerKey?: string;
  reportEmailSender?: OperationalReportEmailSender;
  maxInFlightRequests?: number;
  federationManager?: FederationManager;
  federationLocalSearchProvider?: FederationLocalSearchProvider;
  federationSharedKey?: string;
  digitalTwinAssetRoot?: string;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options?.logger ?? false,
    trustProxy: Boolean(options?.edgeBridgeSharedKey),
  });
  const store = options?.store ?? new MemoryStore();
  const runtimeGuard = new RuntimeGuard(options?.maxInFlightRequests ?? Number(process.env.MAX_IN_FLIGHT_REQUESTS ?? 500));
  runtimeGuard.register(app);
  const mediaGatewaySharedKey =
    options?.mediaGatewaySharedKey ??
    "development-media-gateway-key-change-me";
  const standardAlertSender = new HttpAlertNotificationSender({
    ...(process.env.ALERT_SMS_WEBHOOK_URL ? { sms: process.env.ALERT_SMS_WEBHOOK_URL } : {}),
    ...(process.env.ALERT_EMAIL_WEBHOOK_URL ? { email: process.env.ALERT_EMAIL_WEBHOOK_URL } : {}),
    ...(process.env.ALERT_VOICE_WEBHOOK_URL ? { voice: process.env.ALERT_VOICE_WEBHOOK_URL } : {}),
  }, process.env.ALERT_PROVIDER_TOKEN);
  const voiceProviderNames = alertProviderNames(process.env.ALERT_VOICE_PROVIDER, process.env.ALERT_VOICE_FAILOVER_PROVIDER);
  const smsProviderNames = alertProviderNames(process.env.ALERT_SMS_PROVIDER, process.env.ALERT_SMS_FAILOVER_PROVIDER);
  const voiceCallbackSecret = options?.voiceCallbackSecret ?? process.env.ALERT_VOICE_CALLBACK_SECRET;
  if ((voiceProviderNames.length > 0 || smsProviderNames.length > 0) && !voiceCallbackSecret) {
    throw new Error("ALERT_VOICE_CALLBACK_SECRET is required when provider callbacks are enabled");
  }
  const voiceTokens = new VoiceCallbackTokens(voiceCallbackSecret ?? "development-voice-callback-secret-change-me");
  const publicAlertBaseUrl = process.env.ALERT_PUBLIC_BASE_URL ?? "";
  if ((voiceProviderNames.length > 0 || smsProviderNames.length > 0) && !/^https:\/\//i.test(publicAlertBaseUrl)) {
    throw new Error("ALERT_PUBLIC_BASE_URL must be a provider-reachable HTTPS URL when external notifications are enabled");
  }
  const emailAlertSender = providerSender(store, configuredAlertEmailTargets(store));
  const smsAlertSender = providerSender(store, configuredAlertSmsTargets(store, publicAlertBaseUrl, voiceTokens));
  const voiceAlertSender = providerSender(store, configuredAlertVoiceTargets(store, publicAlertBaseUrl, voiceTokens));
  const configuredAlertSender: AlertNotificationSender = new RoutedAlertNotificationSender(
    standardAlertSender, voiceAlertSender ?? standardAlertSender, smsAlertSender, emailAlertSender,
  );
  const alertSender = options?.alertNotificationSender ?? configuredAlertSender;
  const alertDispatcher = new AlertNotificationDispatcher(store, alertSender);
  const alertEvidenceClient = options?.alertEvidenceClient ?? (
    options?.recordingEngineUrl && options?.recordingEngineSharedKey
      ? new HttpAlertEvidenceClient(options.recordingEngineUrl, options.recordingEngineSharedKey)
      : undefined
  );
  const reportExportRoot = options?.reportExportRoot ?? process.env.REPORT_EXPORT_ROOT ?? "./report-exports";
  const reportDownloadSecret = options?.reportDownloadSecret ?? process.env.REPORT_DOWNLOAD_SECRET ?? "development-report-download-secret-change-me";
  const reportEmailSender = options?.reportEmailSender ?? configuredReportEmailSender(reportDownloadSecret);
  const operationalReportWorker = new OperationalReportWorker(store, reportExportRoot, reportEmailSender,
    Number(process.env.REPORT_ARCHIVE_RETENTION_DAYS ?? 365));

  // Initialize video search and forensic services
  const pool = (store as any).pool; // Access pool from store
  const recordingRoot = options?.recordingRoot ?? process.env.RECORDING_ROOT ?? "./recordings";
  
  let searchService: RecordingSearchService | undefined;
  let playbackEngine: PlaybackEngine | undefined;
  let snapshotService: SnapshotService | undefined;
  let exportWorker: ExportWorker | undefined;
  let forensicAnalyzer: ForensicAnalyzer | undefined;

  if (pool) {
    try {
      searchService = new RecordingSearchService(pool);
      playbackEngine = new PlaybackEngine(pool);
      snapshotService = new SnapshotService(pool);
      exportWorker = new ExportWorker(pool);
      forensicAnalyzer = new ForensicAnalyzer(pool, recordingRoot);
      app.log.info("Video search and forensic services initialized");
    } catch (error) {
      app.log.warn({ error }, "Failed to initialize video search services");
    }
  }
  const federationSharedKey = options?.federationSharedKey ?? process.env.FEDERATION_SHARED_KEY;
  const federationManager = options?.federationManager ?? new FederationManager(
    pool ? new PostgresFederationRepository(pool) : new MemoryFederationRepository(),
    new HttpFederationPeerClient(
      federationSharedKey,
      Number(process.env.FEDERATION_PEER_TIMEOUT_MS ?? 8_000),
    ),
    Number(process.env.FEDERATION_HEARTBEAT_TTL_SECONDS ?? 90) * 1_000,
  );
  const federationLocalSearchProvider = options?.federationLocalSearchProvider
    ?? (searchService
      ? new RecordingFederationSearchProvider(searchService)
      : new EmptyFederationLocalSearchProvider());

  await app.register(cors, { origin: false });

  app.decorateRequest("currentUser");
  app.decorateRequest("edgeAgentAuthenticated", false);
  const extendedStore = hasExtendedInfrastructure(store) ? store : undefined;
  const sessionAuth = extendedStore
    ? createAuthMiddleware({
        store: extendedStore,
        developmentMode: (options?.authMode ?? "development") === "development",
      })
    : undefined;
  const loginRateLimiter = new RateLimiter(20, 15 * 60 * 1000);

  app.addHook("preHandler", async (request, reply) => {
    if (
      request.url === "/health" ||
      request.url === "/ready" ||
      request.url === "/metrics" ||
      request.url === "/internal/live-sessions/consume" ||
      request.url.startsWith("/internal/recording/") ||
      request.url.startsWith("/internal/analytics/") ||
      request.url.startsWith("/internal/alerts/")
      || request.url.startsWith("/internal/federation/")
      || request.url.startsWith("/internal/reports/")
    ) return;

    const edgeAgentIngressRoute = isEdgeAgentIngressRoute(request.method, request.url);
    const edgeBridgeHeader = request.headers["x-edge-bridge-key"];
    const edgeBridgeAuthenticated = Boolean(options?.edgeBridgeSharedKey) && secureEqualHeader(
      edgeBridgeHeader,
      options!.edgeBridgeSharedKey!,
    );
    if (edgeAgentIngressRoute && options?.edgeBridgeSharedKey && edgeBridgeHeader && !edgeBridgeAuthenticated) {
      return reply.code(401).send({ error: "invalid_bridge_identity" });
    }
    if (edgeAgentIngressRoute && edgeBridgeAuthenticated) {
      request.edgeAgentAuthenticated = true;
      return;
    }

    if ((request.routeOptions.config as unknown as Record<string, unknown>)?.noAuth) {
      return loginRateLimiter.middleware()(request, reply);
    }

    if (sessionAuth) {
      return sessionAuth(request, reply);
    }

    // Memory-store development identity for local tests.
    const identity = request.headers["x-user-id"];
    if (typeof identity !== "string") {
      return reply.code(401).send({
        error: "unauthenticated",
        message: "Supply x-user-id while AUTH_MODE=development",
      });
    }
    const user = await store.getUser(identity);
    if (!user) return reply.code(401).send({ error: "unknown_user" });
    request.currentUser = user;
  });

  app.addHook("onClose", async () => store.close());

  app.get("/health", async () => ({
    status: "ok",
    service: "sentinel-control-plane",
  }));

  app.get("/ready", async (_request, reply) => {
    const databasePool = (store as unknown as { pool?: { query(sql: string): Promise<unknown> } }).pool;
    try {
      if (databasePool) await databasePool.query("SELECT 1");
      return { status: "ready", database: databasePool ? "connected" : "memory" };
    } catch {
      return reply.code(503).send({ status: "not-ready", database: "unavailable" });
    }
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  app.get("/metrics", async (_request, reply) => reply.type("text/plain; version=0.0.4").send(runtimeGuard.prometheus()));

  app.get("/v1/me", async (request) => request.currentUser);

  app.get("/v1/capacity/assessment", async () => ({
    capability: "Support approximately 400 branches / 5,000 cameras",
    status: "Evidence harness available; production certification pending",
    verifiedCompletion: 65,
    summary: "The real API load, resilience and export contracts now produce measured evidence, but no approved 400-branch, 5,000-camera, 100-user 24-hour production-like result is attached yet.",
    metrics: {
      branches: 400,
      cameras: 5000,
      branchScaleTarget: 400,
      cameraScaleTarget: 5000,
    },
    evidence: {
      loadTestCompleted: false,
      contractAccurateHarnessAvailable: true,
      progressiveStagesSupported: [10, 50, 100, 400],
      measuredMetricsOnly: true,
      productionBenchmarkCompleted: false,
      enduranceBenchmarkCompleted: false,
      failoverValidated: false,
    },
    futureBranches: {
      capability: "Unlimited future branches",
      status: "Designed for horizontal growth",
      verifiedCompletion: 35,
      summary: "The platform uses a modular, distributed architecture that can be extended by adding additional service instances, but high-availability clustering, autoscaling and multi-region validation remain unproven.",
    },
  }));

  app.get("/v1/branches", async (request) => {
    const { action } = branchListQuery.parse(request.query);
    return {
      data: await store.listAccessibleNodes(
        request.currentUser,
        action,
        "branch",
      ),
    };
  });

  app.post("/v1/branches", async (request, reply) => {
    const body = z.object({
      parentNodeId: z.string().min(1),
      name: z.string().trim().min(2).max(120),
    }).parse(request.body);
    if (
      !(await requireAccess(
        request,
        reply,
        store,
        "device:configure",
        body.parentNodeId,
      ))
    ) return;

    const branch = await store.createBranch(
      request.currentUser.tenantId,
      body.parentNodeId,
      body.name,
    );
    await audit(request, store, "branch.created", branch.id, "success");
    return reply.code(201).send(branch);
  });

  app.get("/v1/branches/:id/cameras", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { action } = branchListQuery.parse(request.query);
    const branch = await store.getNode(id);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    if (!(await requireAccess(request, reply, store, action, branch.id))) return;
    return {
      data: (await store.listCamerasByBranch(
        request.currentUser,
        id,
        action,
      )).map(safeCamera),
    };
  });

  app.get("/v1/cameras", async (request) => {
    const query = z.object({
      action: z.enum(actions).default("live:view"),
      branchId: z.string().optional(),
      search: z.string().trim().max(120).optional(),
      status: z.enum(["online", "offline", "degraded", "unknown"]).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(200),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query);
    const result = await store.listAccessibleCameras(request.currentUser, query.action, {
      limit: query.limit,
      offset: query.offset,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    const branchIds = [...new Set(result.cameras.map((camera) => camera.branchId))];
    const branches = new Map((await Promise.all(branchIds.map((id) => store.getNode(id))))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => [node.id, node]));
    return {
      data: result.cameras.map((camera) => ({
        ...safeCamera(camera),
        branchName: branches.get(camera.branchId)?.name ?? "Unknown branch",
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  });

  app.get("/v1/cameras/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraAccess(request, reply, store, camera))) return;
    return safeCamera(camera);
  });

  app.get("/v1/cameras/:id/capabilities", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraAccess(request, reply, store, camera))) return;
    return { cameraId: camera.id, capabilities: camera.capabilities, profiles: camera.profiles };
  });

  app.post("/v1/branches/:branchId/edge-agents/register", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const body = z.object({
      name: z.string().trim().min(2).max(120),
      version: z.string().trim().min(1).max(40),
    }).parse(request.body);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const agent = await store.registerEdgeAgent(branchId, body.name, body.version);
    await audit(request, store, "edge_agent.registered", branchId, "success", {
      edgeAgentId: agent.id,
    });
    return reply.code(201).send(agent);
  });

  app.get("/v1/branches/:branchId/edge-agents", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    return { data: await store.listEdgeAgentsByBranch(branchId) };
  });

  app.post("/v1/edge-agents/:id/heartbeat", async (request, reply) => {
    const { id } = edgeAgentParams.parse(request.params);
    const body = z.object({
      version: z.string().min(1).max(40),
      publicMediaUrl: z.string().url().optional(),
    }).parse(request.body);
    // Temporary operator authentication; replace with edge-agent mTLS identity.
    const agent = await store.heartbeatEdgeAgent(id, body.version!, body.publicMediaUrl);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    return agent;
  });

  // The edge agent receives only the opaque local-secret reference, never the RTSP URI itself.
  // This route is intentionally scoped to the agent identifier used for its telemetry endpoint.
  app.get("/v1/edge-agents/:id/cameras/monitoring", async (request, reply) => {
    const { id } = edgeAgentParams.parse(request.params);
    const agent = await store.heartbeatEdgeAgent(
      id,
      request.headers["x-edge-agent-version"] as string || "unknown",
    );
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const cameras = await store.listCamerasByEdgeAgent(id);
    return {
      data: cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        profiles: camera.profiles,
        connectionSecretRef: camera.connectionSecretRef,
      })),
    };
  });

  app.post("/v1/branches/:branchId/device-scans", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const body = z.object({ edgeAgentId: z.string().min(1).optional() }).parse(request.body ?? {});
    const agents = await store.listEdgeAgentsByBranch(branchId);
    if (agents.length === 0) {
      return reply.code(409).send({ error: "edge_agent_required" });
    }
    const job = await store.createEdgeScanJob(branchId, body.edgeAgentId);
    await audit(request, store, "device_scan.requested", branchId, "success", {
      scanJobId: job.id,
      edgeAgentId: job.edgeAgentId,
    });
    return reply.code(202).send({ id: job.id, status: job.status, branchId });
  });

  app.get("/v1/device-scans/:scanId", async (request, reply) => {
    const { scanId } = z.object({ scanId: z.string().min(1) }).parse(request.params);
    const query = z.object({ branchId: z.string() }).parse(request.query);
    const job = await store.getEdgeScanJob(query.branchId, scanId);
    if (!job) return reply.code(404).send({ error: "scan_not_found" });
    return job;
  });

  app.get("/v1/device-scans/:scanId/results", async (request, reply) => {
    const { scanId } = z.object({ scanId: z.string().min(1) }).parse(request.params);
    const query = z.object({ branchId: z.string() }).parse(request.query);
    const job = await store.getEdgeScanJob(query.branchId, scanId);
    if (!job) return reply.code(404).send({ error: "scan_not_found" });
    const discoveries = await store.listDiscoveredCameras(query.branchId);
    return { data: discoveries.map((item) => ({
      discoveryId: item.id,
      manufacturer: item.manufacturer ?? "Unknown",
      model: item.model,
      displayName: item.displayName ?? `${item.manufacturer ?? "Unknown"} ${item.model}`,
      firmwareVersion: item.firmwareVersion,
      onvifSupported: item.onvifSupport ?? false,
      streamVerified: item.streamVerified ?? item.rtspValidated ?? false,
      compatibility: item.compatibility ?? (item.compatibilityStatus ?? "review-required"),
      duplicate: item.duplicateStatus === "duplicate",
      status: item.status,
      ipAddress: item.ipAddress,
      credentialsRequired: item.credentialsRequired ?? false,
    })) };
  });

  app.post("/v1/branches/:branchId/scan-jobs", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const body = z.object({ edgeAgentId: z.string().min(1).optional() })
      .parse(request.body ?? {});
    const agents = await store.listEdgeAgentsByBranch(branchId);
    if (agents.length === 0) {
      return reply.code(409).send({ error: "edge_agent_required" });
    }
    const job = await store.createEdgeScanJob(branchId, body.edgeAgentId);
    await audit(request, store, "edge_scan.requested", branchId, "success", {
      scanJobId: job.id,
      edgeAgentId: job.edgeAgentId,
    });
    return reply.code(202).send(job);
  });

  app.get("/v1/branches/:branchId/scan-jobs/:jobId", async (request, reply) => {
    const { branchId, jobId } = z.object({
      branchId: z.string().min(1), jobId: z.string().min(1),
    }).parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const job = await store.getEdgeScanJob(branchId, jobId);
    return job ?? reply.code(404).send({ error: "scan_job_not_found" });
  });

  app.get("/v1/edge-agents/:id/scan-jobs/next", async (request, reply) => {
    const { id } = edgeAgentParams.parse(request.params);
    const agent = await store.heartbeatEdgeAgent(id, request.headers["x-edge-agent-version"] as string || "unknown");
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const job = await store.claimEdgeScanJob(id);
    return job ?? reply.code(204).send();
  });

  app.post("/v1/edge-agents/:id/scan-jobs/:jobId/complete", async (request, reply) => {
    const { id, jobId } = edgeScanParams.parse(request.params);
    const result = z.object({
      status: z.enum(["completed", "failed"]),
      resultCount: z.number().int().nonnegative(),
      error: z.string().max(2_000).optional(),
    }).parse(request.body);
    const job = await store.completeEdgeScanJob(id, jobId, {
      status: result.status!,
      resultCount: result.resultCount!,
      ...(result.error ? { error: result.error } : {}),
    });
    return job ?? reply.code(404).send({ error: "scan_job_not_found" });
  });

  app.post("/v1/branches/:branchId/cameras/discovered", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!request.edgeAgentAuthenticated && !(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const parsed = z.object({
      edgeAgentId: z.string().min(1),
      discoveryMethod: z.enum(["onvif-ws-discovery", "configured-ip-range", "manual-ip-registration", "csv-bulk-import", "nvr-dvr-channel-discovery", "vendor-api-discovery", "snmp-discovery", "edge-agent-reported-inventory"]).default("edge-agent-reported-inventory"),
      vendor: z.enum(["hikvision", "cp-plus", "other"]).default("other"),
      manufacturer: z.string().trim().min(1).max(120).optional(),
      model: z.string().trim().min(1).max(120),
      ipAddress: z.string().ip(),
      macAddress: z.string().trim().max(80).optional(),
      serialNumber: z.string().trim().max(120).optional(),
      firmwareVersion: z.string().trim().max(200).optional(),
      onvifSupport: z.boolean().optional(),
      onvifEndpointReference: z.string().trim().max(500).optional(),
      onvifServices: z.array(z.string().trim().min(1).max(120)).optional(),
      onvifCapabilityTests: z.array(onvifCapabilityTestSchema).optional(),
      mediaProfiles: z.array(cameraProfileSchema).optional(),
      rtspValidated: z.boolean().optional(),
      ptzCapability: z.boolean().optional(),
      audioCapability: z.boolean().optional(),
      analyticsCapability: z.boolean().optional(),
      timeSynchronization: z.enum(["synchronized", "drifted", "unknown"]).optional(),
      duplicateStatus: z.enum(["unique", "duplicate", "review-required"]).optional(),
      compatibilityStatus: z.enum(["compatible", "incompatible", "review-required"]).optional(),
      hardwareId: z.string().trim().max(120).optional(),
      existingDeviceAssociation: z.string().trim().max(200).optional(),
      displayName: z.string().trim().max(200).optional(),
      statusReason: z.string().trim().max(200).optional(),
      credentialsRequired: z.boolean().optional(),
      streamVerified: z.boolean().optional(),
      compatibility: z.string().trim().max(80).optional(),
      onvifPort: z.number().int().min(1).max(65535),
      rtspPort: z.number().int().min(1).max(65535),
      profiles: z.array(cameraProfileSchema).min(1),
      capabilities: capabilitiesSchema,
    }).parse(request.body);
    if (request.edgeAgentAuthenticated) {
      const branchAgents = await store.listEdgeAgentsByBranch(branchId);
      if (!branchAgents.some((agent) => agent.id === parsed.edgeAgentId)) {
        return reply.code(403).send({ error: "edge_agent_branch_mismatch" });
      }
    }
    const discoveryInput: CameraDiscoveryInput = {
      edgeAgentId: parsed.edgeAgentId,
      discoveryMethod: parsed.discoveryMethod,
      vendor: parsed.vendor,
      manufacturer: parsed.manufacturer,
      model: parsed.model,
      ipAddress: parsed.ipAddress,
      macAddress: parsed.macAddress,
      serialNumber: parsed.serialNumber,
      firmwareVersion: parsed.firmwareVersion,
      onvifSupport: parsed.onvifSupport,
      onvifEndpointReference: parsed.onvifEndpointReference,
      onvifServices: parsed.onvifServices,
      onvifCapabilityTests: parsed.onvifCapabilityTests as CameraDiscoveryInput["onvifCapabilityTests"],
      mediaProfiles: parsed.mediaProfiles?.map(p => ({
        name: p.name,
        codec: p.codec,
        width: p.width,
        height: p.height,
        rtspUri: p.rtspUri,
      })),
      rtspValidated: parsed.rtspValidated,
      ptzCapability: parsed.ptzCapability,
      audioCapability: parsed.audioCapability,
      analyticsCapability: parsed.analyticsCapability,
      timeSynchronization: parsed.timeSynchronization,
      duplicateStatus: parsed.duplicateStatus,
      compatibilityStatus: parsed.compatibilityStatus,
      hardwareId: parsed.hardwareId,
      existingDeviceAssociation: parsed.existingDeviceAssociation,
      displayName: parsed.displayName,
      statusReason: parsed.statusReason,
      credentialsRequired: parsed.credentialsRequired,
      streamVerified: parsed.streamVerified,
      compatibility: parsed.compatibility,
      onvifPort: parsed.onvifPort,
      rtspPort: parsed.rtspPort,
      profiles: parsed.profiles.map(p => ({
        name: p.name,
        codec: p.codec,
        width: p.width,
        height: p.height,
        rtspUri: p.rtspUri,
      })),
      capabilities: {
        ptz: parsed.capabilities.ptz,
        audio: parsed.capabilities.audio,
        events: parsed.capabilities.events,
      },
    };
    const discovery = await store.createDiscovery(branchId, discoveryInput);
    if (request.edgeAgentAuthenticated) {
      const branch = await store.getNode(branchId);
      await store.writeAudit({
        tenantId: branch!.tenantId, actorUserId: null, action: "camera.discovered",
        resourceNodeId: branchId, outcome: "success", sourceIp: request.ip,
        details: { discoveryId: discovery.id, edgeAgentId: discovery.edgeAgentId, vendor: discovery.vendor, model: discovery.model },
      });
    } else {
      await audit(request, store, "camera.discovered", branchId, "success", {
        discoveryId: discovery.id, vendor: discovery.vendor, model: discovery.model,
      });
    }
    return reply.code(202).send(discovery);
  });

  app.post("/v1/branches/:branchId/cameras/discovered/:discoveryId/approve", async (request, reply) => {
    const { branchId, discoveryId } = z.object({ branchId: z.string().min(1), discoveryId: z.string().min(1) }).parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const parsed = z.object({
      name: z.string().trim().min(2).max(120),
      channel: z.number().int().positive().default(1),
      protocol: z.enum(["onvif-t", "onvif-s", "rtsp", "vendor-adapter"]).default("onvif-t"),
      connectionSecretRef: z.string().trim().min(8).max(500),
    }).parse(request.body ?? {});
    const discovery = (await store.listDiscoveredCameras(branchId)).find((item) => item.id === discoveryId);
    if (!discovery) return reply.code(404).send({ error: "discovery_not_found" });
    const camera = await store.approveCamera(branchId, {
      discoveryId,
      name: parsed.name,
      channel: parsed.channel,
      protocol: parsed.protocol,
      connectionSecretRef: parsed.connectionSecretRef,
    });
    if (!camera) return reply.code(404).send({ error: "discovery_not_found" });
    await audit(request, store, "camera.approved", branchId, "success", { discoveryId, cameraId: camera.id });
    return reply.code(201).send(safeCamera(camera));
  });

  app.post("/v1/branches/:branchId/cameras/discovered/approve-all", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const body = z.object({
      recordingMode: z.enum(["continuous", "motion"]).default("continuous"),
      retentionDays: z.number().int().min(1).max(3650).default(180),
      enableAnalytics: z.boolean().default(true),
      enableAlerts: z.boolean().default(true),
    }).parse(request.body ?? {});
    const discoveries = await store.listDiscoveredCameras(branchId);
    const currentCameras = await store.listCamerasByBranch(
      request.currentUser,
      branchId,
      "device:configure",
    );
    const results: Array<Record<string, unknown>> = [];
    let nextChannel = currentCameras.reduce(
      (maximum, camera) => Math.max(maximum, camera.channel),
      0,
    ) + 1;

    for (const discovery of discoveries) {
      const blockedReason = discovery.duplicateStatus === "duplicate"
        ? "duplicate_camera"
        : discovery.compatibilityStatus === "incompatible"
          ? "incompatible_camera"
          : discovery.credentialsRequired
            ? "camera_credentials_required"
            : !discovery.streamVerified
              ? "stream_not_verified"
              : undefined;
      if (blockedReason) {
        results.push({
          discoveryId: discovery.id,
          name: discovery.displayName ?? discovery.model,
          status: "needs-attention",
          reason: blockedReason,
        });
        continue;
      }

      try {
        const camera = await store.approveCamera(branchId, {
          discoveryId: discovery.id,
          name: discovery.displayName ??
            `${discovery.manufacturer ?? discovery.vendor} ${discovery.model}`,
          channel: nextChannel++,
          protocol: "onvif-t",
          connectionSecretRef: `edge://${discovery.edgeAgentId}/${discovery.id}`,
        });
        if (!camera) throw new Error("camera_approval_failed");
        await store.updateCameraStatus(camera.id, "online");

        const hotRetentionDays = Math.min(30, body.retentionDays);
        const warmRetentionDays = Math.min(
          60,
          Math.max(0, body.retentionDays - hotRetentionDays),
        );
        const coldRetentionDays = Math.max(
          0,
          body.retentionDays - hotRetentionDays - warmRetentionDays,
        );
        const recordingInput = recordingJobSchema.parse({
          mode: body.recordingMode,
          enabled: true,
          retentionDays: body.retentionDays,
          hotRetentionDays,
          warmRetentionDays,
          coldRetentionDays,
        });
        let recording = await store.upsertRecordingJob(camera.id, {
          ...recordingInput,
          status: "idle",
        } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">);
        let recordingStatus: "recording" | "configured" | "failed" = "configured";
        if (options?.recordingEngineUrl && options.recordingEngineSharedKey) {
          const engineResponse = await fetch(
            new URL("/internal/jobs", options.recordingEngineUrl),
            {
              method: "PUT",
              headers: {
                "content-type": "application/json",
                "x-recording-engine-key": options.recordingEngineSharedKey,
              },
              body: JSON.stringify({
                tenantId: request.currentUser.tenantId,
                branchId,
                cameraId: camera.id,
                connectionSecretRef: camera.connectionSecretRef,
                job: recording,
              }),
            },
          );
          if (engineResponse.ok) {
            const active = z.object({ active: z.boolean() })
              .parse(await engineResponse.json()).active;
            recordingStatus = active ? "recording" : "configured";
            recording = await store.upsertRecordingJob(camera.id, {
              ...recordingInput,
              status: active ? "recording" : "idle",
            } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">);
          } else {
            recordingStatus = "failed";
            recording = await store.upsertRecordingJob(camera.id, {
              ...recordingInput,
              status: "error",
            } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">);
          }
        }

        const analyticsRules = [];
        if (body.enableAnalytics) {
          const existingRules = await store.listAnalyticsRules(camera.id);
          const automaticRules = [
            { name: "Auto · Motion", detectionType: "motion", severity: "P3" },
            { name: "Auto · Person", detectionType: "person", severity: "P3" },
            { name: "Auto · Vehicle", detectionType: "vehicle", severity: "P3" },
            { name: "Auto · Fire", detectionType: "fire", severity: "P1" },
            { name: "Auto · Smoke", detectionType: "smoke", severity: "P1" },
            { name: "Auto · Fall", detectionType: "fall", severity: "P1" },
            { name: "Auto · Weapon", detectionType: "weapon", severity: "P1" },
            { name: "Auto · No helmet", detectionType: "no-helmet", severity: "P2" },
            { name: "Auto · Camera tampering", detectionType: "camera-tampering", severity: "P2" },
            { name: "Auto · Video loss", detectionType: "video-loss", severity: "P1" },
          ] as const;
          for (const automatic of automaticRules) {
            const existing = existingRules.find((rule) => rule.name === automatic.name);
            analyticsRules.push(existing ?? await store.createAnalyticsRule(
              request.currentUser.tenantId,
              camera.id,
              request.currentUser.id,
              {
                ...automatic,
                enabled: true,
                objectClasses: [],
                minConfidence: 0.65,
                minDurationSeconds: 0,
                direction: "any",
                cooldownSeconds: 60,
                recipients: [],
                recordingPolicy: "event-recording",
                preRollSeconds: 30,
                postRollSeconds: 120,
              },
            ));
          }
        }

        await audit(request, store, "camera.auto_provisioned", camera.nodeId,
          "success", {
            discoveryId: discovery.id,
            cameraId: camera.id,
            recordingStatus,
            analyticsRuleCount: analyticsRules.length,
            alertsEnabled: body.enableAlerts && analyticsRules.length > 0,
          });
        results.push({
          discoveryId: discovery.id,
          cameraId: camera.id,
          name: camera.name,
          status: recordingStatus === "failed" ? "partial" : "provisioned",
          stages: {
            approved: true,
            recording: recordingStatus,
            analytics: body.enableAnalytics ? "active" : "disabled",
            alerts: body.enableAlerts && analyticsRules.length > 0 ? "enabled" : "disabled",
          },
        });
      } catch (error) {
        results.push({
          discoveryId: discovery.id,
          name: discovery.displayName ?? discovery.model,
          status: "failed",
          reason: error instanceof Error ? error.message : "auto_provisioning_failed",
        });
      }
    }

    const provisioned = results.filter((result) => result.status === "provisioned").length;
    const partial = results.filter((result) => result.status === "partial").length;
    const needsAttention = results.filter((result) => result.status === "needs-attention").length;
    const failed = results.filter((result) => result.status === "failed").length;
    return reply.code(failed > 0 && provisioned === 0 ? 207 : 201).send({
      branchId,
      summary: { total: results.length, provisioned, partial, needsAttention, failed },
      results,
    });
  });

  app.post("/v1/branches/:branchId/cameras/discovered/:discoveryId/reject", async (request, reply) => {
    const { branchId, discoveryId } = z.object({ branchId: z.string().min(1), discoveryId: z.string().min(1) }).parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const parsed = z.object({ reason: z.string().trim().max(200).optional() }).parse(request.body ?? {});
    const discovery = await store.rejectDiscovery(discoveryId, parsed.reason);
    if (!discovery) return reply.code(404).send({ error: "discovery_not_found" });
    await audit(request, store, "camera.discovery_rejected", branchId, "success", { discoveryId, reason: parsed.reason });
    return { success: true, discovery };
  });

  app.patch("/v1/branches/:branchId/cameras/discovered/:discoveryId/rename", async (request, reply) => {
    const { branchId, discoveryId } = z.object({ branchId: z.string().min(1), discoveryId: z.string().min(1) }).parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const parsed = z.object({ displayName: z.string().trim().min(1).max(120) }).parse(request.body ?? {});
    const discovery = await store.renameDiscovery(discoveryId, parsed.displayName);
    if (!discovery) return reply.code(404).send({ error: "discovery_not_found" });
    await audit(request, store, "camera.discovery_renamed", branchId, "success", { discoveryId, displayName: parsed.displayName });
    return { success: true, discovery };
  });

  app.post("/v1/branches/:branchId/cameras", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const parsed = z.object({
      discoveryId: z.string().min(1).optional(),
      name: z.string().trim().min(2).max(120),
      channel: z.number().int().positive(),
      protocol: z.enum(["onvif-t", "onvif-s", "rtsp", "vendor-adapter"]),
      connectionSecretRef: z.string().min(8).max(500),
      branchCode: z.string().trim().max(80).optional(),
      manufacturer: z.string().trim().max(120).optional(),
      model: z.string().trim().max(120).optional(),
      serialNumber: z.string().trim().max(120).optional(),
      ipAddress: z.string().trim().max(120).optional(),
      onvifPort: z.number().int().min(1).max(65535).optional(),
      rtspPort: z.number().int().min(1).max(65535).optional(),
      streamProfile: z.string().trim().max(80).optional(),
    }).parse(request.body);
    const approvalInput = {
      discoveryId: parsed.discoveryId ?? "",
      name: parsed.name,
      channel: parsed.channel,
      protocol: parsed.protocol,
      connectionSecretRef: parsed.connectionSecretRef,
      branchCode: parsed.branchCode,
      manufacturer: parsed.manufacturer,
      model: parsed.model,
      serialNumber: parsed.serialNumber,
      ipAddress: parsed.ipAddress,
      onvifPort: parsed.onvifPort,
      rtspPort: parsed.rtspPort,
      streamProfile: parsed.streamProfile,
    };
    const camera = parsed.discoveryId
      ? await store.approveCamera(branchId, approvalInput)
      : await store.createCameraFromManualRegistration(branchId, approvalInput);
    if (!camera) {
      return reply.code(parsed.discoveryId ? 404 : 400).send({ error: parsed.discoveryId ? "discovery_not_found" : "manual_registration_failed" });
    }
    await audit(request, store, "camera.approved", camera.nodeId, "success", {
      cameraId: camera.id,
      registrationMethod: parsed.discoveryId ? "discovery" : "manual",
    });
    return reply.code(201).send(safeCamera(camera));
  });

  app.post("/v1/branches/:branchId/cameras/bulk-import", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const parsed = z.object({
      csv: z.string().trim().min(1),
    }).parse(request.body);
    const rows = parseBulkCameraCsv(parsed.csv);
    const created = [] as Camera[];
    for (const row of rows) {
      const camera = await store.createCameraFromManualRegistration(branchId, {
        discoveryId: "",
        name: row.cameraName,
        channel: 1,
        protocol: "rtsp",
        connectionSecretRef: row.secretReference,
        branchCode: row.branchCode,
        manufacturer: row.manufacturer,
        model: row.model,
        serialNumber: row.serial,
        ipAddress: row.ip,
        rtspPort: row.port,
        streamProfile: row.streamProfile,
      });
      if (camera) created.push(camera);
    }
    await audit(request, store, "camera.bulk_imported", branchId, "success", {
      count: created.length,
    });
    return reply.code(201).send({ data: created.map((camera) => safeCamera(camera)) });
  });

  app.patch("/v1/cameras/:id/status", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = cameraStatusSchema.parse(request.body);
    const existing = await store.getCamera(id);
    if (!existing) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireAccess(request, reply, store, "device:configure", existing.nodeId))) return;
    const camera = await store.updateCameraStatus(id, body.status);
    await audit(request, store, "camera.status_changed", existing.nodeId, "success", body);
    return safeCamera(camera!);
  });

  app.post("/v1/cameras/:id/live-sessions", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraAccess(request, reply, store, camera))) {
      await audit(request, store, "live_session.created", camera.nodeId, "denied");
      return;
    }
    const session = await store.createLiveSession(id, request.currentUser.id);
    await audit(request, store, "live_session.created", camera.nodeId, "success", {
      sessionId: session.id,
    });
    return reply.code(201).send(session);
  });

  app.get("/v1/cameras/:id/recording", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return (await store.getRecordingJob(id)) ?? {
      cameraId: id, mode: "continuous", enabled: false, status: "disabled",
      retentionDays: 180, preRollSeconds: 30, postRollSeconds: 30,
      minMotionDurationSeconds: 0, motionConfidenceThreshold: 0,
      cooldownSeconds: 60, maxEventDurationSeconds: 0,
      segmentDurationSeconds: 60, hotRetentionDays: 30,
      warmRetentionDays: 60, coldRetentionDays: 90,
      critical: false, backupRequired: false,
      automaticDeletionEnabled: true, evidenceProtection: true,
      recordMainStream: true,
    };
  });

  app.put("/v1/cameras/:id/recording", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireAccess(request, reply, store, "device:configure", camera.nodeId))) return;
    const input = recordingJobSchema.parse(request.body);
    if (input.mode === "scheduled" && !input.schedule) {
      return reply.code(400).send({ error: "schedule_required" });
    }
    if (input.hotRetentionDays + input.warmRetentionDays +
        input.coldRetentionDays !== input.retentionDays) {
      return reply.code(400).send({ error: "storage_tiers_must_equal_retention" });
    }
    const requestedStatus = !input.enabled
      ? "disabled"
      : input.mode === "scheduled"
        ? "scheduled"
        : "idle";
    const jobPayload = {
      ...input,
      status: requestedStatus,
    } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">;
    let job = await store.upsertRecordingJob(id, jobPayload);
    if (options?.recordingEngineUrl && options.recordingEngineSharedKey) {
      const response = await fetch(new URL("/internal/jobs", options.recordingEngineUrl), {
        method: "PUT", headers: { "content-type": "application/json", "x-recording-engine-key": options.recordingEngineSharedKey },
        body: JSON.stringify({
          tenantId: request.currentUser.tenantId,
          branchId: camera.branchId,
          cameraId: id,
          connectionSecretRef: camera.connectionSecretRef,
          job,
        }),
      });
      if (!response.ok) {
        job = await store.upsertRecordingJob(id, { ...input, status: "error" } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">);
        return reply.code(503).send({ error: "recording_engine_unavailable" });
      }
      const engine = z.object({ active: z.boolean() }).parse(await response.json());
      const actualStatus = !input.enabled
        ? "disabled"
        : engine.active
          ? "recording"
          : input.mode === "scheduled"
            ? "scheduled"
            : "idle";
      if (job.status !== actualStatus) {
        job = await store.upsertRecordingJob(id, { ...input, status: actualStatus } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">);
      }
    }
    await audit(request, store, "recording.configured", camera.nodeId, "success", { mode: job.mode, enabled: job.enabled });
    return reply.code(200).send(job);
  });

  app.get("/v1/cameras/:id/recordings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const query = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }).parse(request.query);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return { data: await store.listRecordingSegments(id, query.from, query.to) };
  });

  app.get("/v1/cameras/:id/recording/health", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { limit } = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(request.query);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return { data: await store.listRecordingHealthEvents(id, limit) };
  });

  app.get("/v1/recording-segments/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const segment = await store.getRecordingSegment(id);
    if (!segment) return reply.code(404).send({ error: "recording_segment_not_found" });
    const camera = await store.getCamera(segment.cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return segment;
  });

  app.post("/v1/cameras/:id/recording/events", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = z.object({ type: z.enum(["motion", "event"]), metadata: z.record(z.unknown()).optional() }).parse(request.body);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireAccess(request, reply, store, "device:configure", camera.nodeId))) return;
    const job = await store.getRecordingJob(id);
    if (!job?.enabled || job.mode !== body.type) {
      return reply.code(409).send({ error: "recording_mode_not_triggerable" });
    }
    if (!options?.recordingEngineUrl || !options.recordingEngineSharedKey) {
      return reply.code(503).send({ error: "recording_engine_not_configured" });
    }
    const response = await fetch(new URL(`/internal/jobs/${encodeURIComponent(id)}/trigger`, options.recordingEngineUrl), {
      method: "POST", headers: { "content-type": "application/json", "x-recording-engine-key": options.recordingEngineSharedKey }, body: JSON.stringify(body),
    });
    if (!response.ok) return reply.code(503).send({ error: "recording_engine_unavailable" });
    await audit(request, store, `recording.${body.type}_triggered`, camera.nodeId, "success", body.metadata);
    return reply.code(202).send({ cameraId: id, triggered: body.type });
  });

  app.get("/v1/cameras/:id/playback", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const query = z.object({
      from: z.string().datetime(), to: z.string().datetime(),
    }).parse(request.query);
    const from = Date.parse(query.from);
    const to = Date.parse(query.to);
    if (to <= from || to - from > 31 * 86_400_000) {
      return reply.code(400).send({ error: "invalid_playback_window" });
    }
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    const segments = await store.listRecordingSegments(id, query.from, query.to);
    return buildPlaybackTimeline(segments, query.from, query.to);
  });

  app.post("/v1/recording/storage-calculator", async (request) => {
    const parsed = storageCalculatorSchema.parse(request.body);
    return calculateRecordingStorage({
      cameraCount: parsed.cameraCount,
      bitrateMbps: parsed.bitrateMbps,
      recordingHoursPerDay: parsed.recordingHoursPerDay,
      retentionDays: parsed.retentionDays,
      metadataAndIndexPercent: parsed.metadataAndIndexPercent,
      safetyReservePercent: parsed.safetyReservePercent,
      raidUsablePercent: parsed.raidUsablePercent,
      backupCopies: parsed.backupCopies,
    });
  });

  app.get("/v1/cameras/:id/recording/legal-holds", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return { data: await store.listRecordingLegalHolds(id) };
  });

  app.post("/v1/cameras/:id/recording/legal-holds", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = z.object({
      fromAt: z.string().datetime(), toAt: z.string().datetime(),
      reason: z.string().trim().min(3).max(1_000),
    }).parse(request.body);
    if (Date.parse(body.toAt) <= Date.parse(body.fromAt)) {
      return reply.code(400).send({ error: "invalid_legal_hold_window" });
    }
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "evidence:export",
    ))) return;
    const hold = await store.createRecordingLegalHold({
      tenantId: request.currentUser.tenantId, cameraId: id,
      fromAt: body.fromAt, toAt: body.toAt, reason: body.reason,
      createdBy: request.currentUser.id,
    });
    await audit(request, store, "recording.legal_hold_created", camera.nodeId,
      "success", { legalHoldId: hold.id, fromAt: hold.fromAt, toAt: hold.toAt });
    return reply.code(201).send(hold);
  });

  app.delete("/v1/cameras/:id/recording/legal-holds/:holdId", async (request, reply) => {
    const params = z.object({
      id: z.string().min(1), holdId: z.string().min(1),
    }).parse(request.params);
    const camera = await store.getCamera(params.id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "evidence:export",
    ))) return;
    const hold = await store.releaseRecordingLegalHold(
      params.holdId, request.currentUser.tenantId, params.id,
      request.currentUser.id,
    );
    if (!hold) {
      return reply.code(404).send({ error: "legal_hold_not_found" });
    }
    await audit(request, store, "recording.legal_hold_released", camera.nodeId,
      "success", { legalHoldId: hold.id });
    return hold;
  });

  app.post("/internal/recording/segments", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const input = internalSegmentSchema.parse(request.body);
    if (Date.parse(input.endedAt) <= Date.parse(input.startedAt)) {
      return reply.code(400).send({ error: "invalid_segment_window" });
    }
    const camera = await store.getCamera(input.cameraId);
    const node = camera ? await store.getNode(camera.nodeId) : undefined;
    const job = camera ? await store.getRecordingJob(camera.id) : undefined;
    if (!camera || !node || node.tenantId !== input.tenantId || job?.id !== input.jobId) {
      return reply.code(404).send({ error: "recording_job_not_found" });
    }
    const segment = await store.createRecordingSegment({
      cameraId: input.cameraId,
      jobId: input.jobId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      storagePath: input.storagePath,
      sizeBytes: input.sizeBytes,
      storageNodeExternalId: input.storageNodeExternalId,
      storageTier: input.storageTier,
      status: input.status,
      checksumSha256: input.checksumSha256,
      codec: input.codec,
    });
    return reply.code(201).send(segment);
  });

  app.put("/internal/recording/storage-nodes/:externalId", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const { externalId } = z.object({ externalId: z.string().min(1).max(200) })
      .parse(request.params);
    const input = z.object({
      tenantId: z.string().min(1), name: z.string().min(1).max(200),
      scopeNodeId: z.string().min(1).optional(),
      supportedTiers: z.array(z.enum(["hot", "warm", "cold"])).min(1),
      capacityBytes: z.number().int().nonnegative(),
      usedBytes: z.number().int().nonnegative(),
      availableBytes: z.number().int().nonnegative(),
      status: z.enum(["healthy", "warning", "critical", "offline"]),
      storageType: z.enum(["local-disk", "nfs", "smb", "s3", "cloud-archive", "san"]).default("local-disk"),
      supportedProtocols: z.array(z.string().trim().min(1)).min(1).default(["fs"]),
      location: z.string().trim().optional(),
      mountPath: z.string().trim().optional(),
      readMbps: z.number().nonnegative().optional(),
      latencyMs: z.number().nonnegative().optional(),
      temperatureCelsius: z.number().min(-100).max(200).optional(),
      writeMbps: z.number().nonnegative().optional(),
      smart: z.object({
        overallStatus: z.enum(["passed", "failed", "unknown"]),
        reallocatedSectors: z.number().int().nonnegative(),
        pendingSectors: z.number().int().nonnegative(),
        uncorrectableSectors: z.number().int().nonnegative(),
        temperatureCelsius: z.number().optional(),
        powerOnHours: z.number().int().nonnegative().optional(),
        readErrors: z.number().int().nonnegative(),
        writeErrors: z.number().int().nonnegative(),
        remainingSsdLifePercent: z.number().min(0).max(100).optional(),
        interfaceCrcErrors: z.number().int().nonnegative(),
      }).optional(),
      raid: z.object({
        status: z.enum(["healthy", "degraded", "rebuilding", "failed", "unknown"]),
        level: z.string().trim().optional(),
        memberDisks: z.array(z.string().trim().min(1)).default([]),
        failedMembers: z.array(z.string().trim().min(1)).default([]),
        rebuildProgressPercent: z.number().min(0).max(100).optional(),
        hotSpareStatus: z.enum(["active", "inactive", "unknown"]).optional(),
        controllerHealth: z.enum(["healthy", "warning", "critical", "unknown"]).optional(),
      }).optional(),
      lastWriteProbe: z.object({
        status: z.enum(["passed", "failed"]),
        latencyMs: z.number().nonnegative(),
        bytesWritten: z.number().int().nonnegative(),
        checksum: z.string().min(1),
        error: z.string().optional(),
      }).optional(),
    }).parse(request.body);
    if (input.usedBytes + input.availableBytes > input.capacityBytes * 1.01) {
      return reply.code(400).send({ error: "invalid_storage_capacity" });
    }
    if (input.scopeNodeId) {
      const scope = await store.getNode(input.scopeNodeId);
      if (!scope || scope.tenantId !== input.tenantId) {
        return reply.code(400).send({ error: "invalid_storage_scope" });
      }
    }
    return store.upsertRecordingStorageNode({ 
      externalId, 
      tenantId: input.tenantId,
      name: input.name,
      scopeNodeId: input.scopeNodeId,
      supportedTiers: input.supportedTiers,
      capacityBytes: input.capacityBytes,
      usedBytes: input.usedBytes,
      availableBytes: input.availableBytes,
      status: input.status,
      storageType: input.storageType,
      supportedProtocols: input.supportedProtocols,
      location: input.location,
      mountPath: input.mountPath,
      readMbps: input.readMbps,
      latencyMs: input.latencyMs,
      temperatureCelsius: input.temperatureCelsius,
      writeMbps: input.writeMbps,
      smart: input.smart,
      raid: input.raid,
      lastWriteProbe: input.lastWriteProbe,
    });
  });

  app.post("/internal/recording/health", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const input = z.object({
      tenantId: z.string().min(1), cameraId: z.string().min(1).optional(),
      storageNodeExternalId: z.string().min(1).max(200).optional(),
      eventType: z.string().min(1).max(100),
      severity: z.enum(["info", "warning", "critical"]),
      message: z.string().min(1).max(1_000),
      details: z.record(z.unknown()).optional(),
    }).parse(request.body);
    if (input.cameraId) {
      const camera = await store.getCamera(input.cameraId);
      const node = camera ? await store.getNode(camera.nodeId) : undefined;
      if (!node || node.tenantId !== input.tenantId) {
        return reply.code(400).send({ error: "invalid_health_event_target" });
      }
    }
    const event = await store.createRecordingHealthEvent({
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      storageNodeExternalId: input.storageNodeExternalId,
      eventType: input.eventType,
      severity: input.severity,
      message: input.message,
      details: input.details,
    });
    if (input.cameraId) {
      const nextStatus = input.eventType === "recording_started"
        ? "recording"
        : input.eventType === "recording_stopped"
          ? "error"
          : input.eventType === "recording_idle"
            ? "idle"
            : input.eventType === "recording_scheduled"
              ? "scheduled"
              : undefined;
      if (nextStatus) await store.updateRecordingJobStatus(input.cameraId, nextStatus);
    }
    return reply.code(201).send(event);
  });

  app.get("/internal/recording/retention-candidates", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const query = z.object({
      tenantId: z.string().min(1), storageNodeExternalId: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(1_000).default(200),
    }).parse(request.query);
    return { data: await store.listRecordingRetentionCandidates(
      query.tenantId, query.storageNodeExternalId, query.limit,
    ) };
  });

  app.post("/internal/recording/segments/deleted", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const input = z.object({
      tenantId: z.string().min(1), storageNodeExternalId: z.string().min(1),
      segmentIds: z.array(z.string().min(1)).min(1).max(1_000),
    }).parse(request.body);
    return { deleted: await store.markRecordingSegmentsDeleted(
      input.tenantId, input.storageNodeExternalId, input.segmentIds,
    ) };
  });

  app.post("/internal/live-sessions/consume", async (request, reply) => {
    const suppliedKey = request.headers["x-media-gateway-key"];
    if (
      typeof suppliedKey !== "string" ||
      !secureEqual(suppliedKey, mediaGatewaySharedKey)
    ) {
      return reply.code(401).send({ error: "invalid_gateway_identity" });
    }
    const body = z.object({ token: z.string().min(32).max(200) }).parse(request.body);
    const session = await store.consumeLiveSession(body.token);
    if (!session) {
      return reply.code(401).send({ error: "invalid_or_consumed_session" });
    }
    await store.writeAudit({
      tenantId: session.tenantId,
      actorUserId: session.userId,
      action: "live_session.consumed",
      resourceNodeId: session.cameraNodeId,
      outcome: "success",
      details: { sessionId: session.id },
    });
    return session;
  });

  app.post("/v1/access/check", async (request, reply) => {
    const body = z.object({
      action: z.enum(actions),
      resourceNodeId: z.string().min(1),
    }).parse(request.body);
    const decision = await store.checkAccess(
      request.currentUser,
      body.action,
      body.resourceNodeId,
    );
    if (!decision) return reply.code(404).send({ error: "resource_not_found" });
    return decision;
  });

  await registerDeviceInventoryRoutes(app, store);
  await registerEdgeAgentPackageRoutes(app, store, {
    controlPlanePublicUrl: options?.controlPlanePublicUrl ?? process.env.CONTROL_PLANE_PUBLIC_URL,
    edgeBridgeSharedKey: options?.edgeBridgeSharedKey ?? process.env.EDGE_BRIDGE_SHARED_KEY,
    artifactRoot: options?.edgeAgentArtifactRoot,
    developmentUserId: (options?.authMode ?? "development") === "development"
      ? "user-global-admin"
      : undefined,
  });
  await registerCameraDiscoveryRoutes(app, store);
  await registerCommandCenterRoutes(app, store);
  await registerDigitalTwinRoutes(app, store, {
    assetRoot: options?.digitalTwinAssetRoot ?? process.env.DIGITAL_TWIN_ASSET_ROOT ?? "./digital-twin-assets",
  });
  // Core maintenance routes depend only on ControlPlaneStore and must be
  // available for both the in-memory development runtime and PostgreSQL.
  await registerMaintenanceRoutes(app, store);
  await registerOperationalHealthRoutes(app, store);
  await registerVideoWallRoutes(app, store);
  await registerFederationRoutes(app, store, federationManager, {
    federationSharedKey,
    localSearchProvider: federationLocalSearchProvider,
  });
  if (extendedStore) {
    await registerDeviceManagementRoutes(app, extendedStore);
    await registerAuthRoutes(app, extendedStore);
    await registerOrganizationRoutes(app, extendedStore);
    await registerUserRoutes(app, extendedStore);
    await registerCameraPermissionRoutes(app, extendedStore);
    await registerCctvInfrastructureRoutes(app, extendedStore);
    await registerComplianceRoutes(app, extendedStore);
    await registerComplianceEnhancedRoutes(app, extendedStore);
    await registerMaintenanceDashboardRoutes(app, extendedStore);
    await registerMaintenanceAdvancedRoutes(app, extendedStore);
    await registerMaintenanceHealthRoutes(app, extendedStore);
    await registerMaintenanceReportsRoutes(app, extendedStore);
    await registerMaintenanceExportRoutes(app, extendedStore);
    await registerFirmwareManagementRoutes(app, extendedStore);
    await registerPredictiveAnalyticsRoutes(app, extendedStore);
    
    // Start maintenance scheduler
    try {
      const { startMaintenanceScheduler } = await import("./maintenance/scheduler.js");
      const stop = startMaintenanceScheduler(extendedStore, app.log);
      app.addHook('onClose', async () => stop());
    } catch (err: unknown) {
      app.log.error({ err }, 'failed to start maintenance scheduler');
    }

    // Start health collector service
    try {
      const { initHealthCollector } = await import("./maintenance/health-collector.js");
      const healthCollector = initHealthCollector(extendedStore, app.log);
      healthCollector.start();
      app.addHook('onClose', async () => healthCollector.stop());
      app.log.info('Health collector service started');
    } catch (err: unknown) {
      app.log.error({ err }, 'failed to start health collector service');
    }

    // Initialize notification service
    try {
      const { initNotificationService } = await import("./services/notification-service.js");
      const { loadNotificationConfig } = await import("./config/notifications.config.js");
      const notificationConfig = loadNotificationConfig();
      const notificationService = initNotificationService(notificationConfig, extendedStore, app.log);
      app.log.info({
        emailConfigured: !!notificationConfig.email,
        smsConfigured: !!notificationConfig.sms,
        webhookConfigured: !!notificationConfig.webhook,
      }, 'Notification service initialized');
    } catch (err: unknown) {
      app.log.warn({ err }, 'Notification service not configured - alerts will be logged only');
    }

    // Start alert engine
    try {
      const { initAlertEngine } = await import("./maintenance/alert-engine.js");
      const alertEngine = initAlertEngine(extendedStore, app.log);
      alertEngine.start();
      app.addHook('onClose', async () => alertEngine.stop());
      app.log.info('Alert engine started');
    } catch (err: unknown) {
      app.log.error({ err }, 'failed to start alert engine');
    }

    // Start scheduled reports service
    try {
      const { initScheduledReportsService } = await import("./maintenance/scheduled-reports.js");
      const scheduledReportsService = initScheduledReportsService(extendedStore, app.log);
      scheduledReportsService.start();
      app.addHook('onClose', async () => scheduledReportsService.stop());
      app.log.info('Scheduled reports service started');
    } catch (err: unknown) {
      app.log.error({ err }, 'failed to start scheduled reports service');
    }
  }
  await registerPrivacyRoutes(app, store);
  await registerReportsRoutes(app, store);
  await registerOperationalReportRoutes(app, store, operationalReportWorker, {
    downloadSecret: reportDownloadSecret, exportRoot: reportExportRoot,
    workerKey: options?.reportWorkerKey ?? process.env.REPORT_WORKER_SHARED_KEY,
  });
  await registerEvidenceRoutes(app, store, exportWorker);
  await registerLiveOperationsRoutes(app, store);
  await registerDashboardRoutes(app, store);
  await registerIncidentsRoutes(app, store);
  await registerAnalyticsRoutes(app, store, {
    ...(options?.analyticsEngineSharedKey
      ? { analyticsEngineSharedKey: options.analyticsEngineSharedKey } : {}),
    ...(options?.analyticsEngineUrl
      ? { analyticsEngineUrl: options?.analyticsEngineUrl } : {}),
    ...(options?.recordingEngineUrl
      ? { recordingEngineUrl: options?.recordingEngineUrl } : {}),
    ...(options?.recordingEngineSharedKey
      ? { recordingEngineSharedKey: options?.recordingEngineSharedKey } : {}),
    ...(alertEvidenceClient ? { alertEvidenceClient } : {}),
    alertDispatcher,
  });
  await registerAnalyticsPhase2Routes(app, store);
  await adminCameraManagementRoutes(app, store);
  await registerAlertCommandCenterRoutes(app, store, alertDispatcher,
    options?.alertWorkerKey ?? process.env.ALERT_WORKER_SHARED_KEY, voiceTokens,
    alertEvidenceClient);
  const alertWorker = setInterval(() => {
    void alertDispatcher.drainOnce().catch((error) => app.log.error({ error }, "Alert outbox drain failed"));
  }, 5_000);
  alertWorker.unref();
  app.addHook("onClose", async () => clearInterval(alertWorker));
  const operationalReportTimer = setInterval(() => {
    void operationalReportWorker.tick().catch((error) => app.log.error({ error }, "Operational report worker failed"));
  }, 30_000);
  operationalReportTimer.unref();
  app.addHook("onClose", async () => clearInterval(operationalReportTimer));

  // Register video search routes if services are available
  if (searchService && playbackEngine && snapshotService) {
    try {
      await registerVideoSearchRoutes(app, {
        searchService,
        playbackEngine,
        snapshotService,
      });
      app.log.info("Video search routes registered");
    } catch (error) {
      app.log.warn({ error }, "Failed to register video search routes");
    }
  }

  // Start export worker if enabled
  if (exportWorker && (options?.enableExportWorker ?? process.env.ENABLE_EXPORT_WORKER !== "false")) {
    startExportWorker(app, exportWorker, pool);
  }

  // Initialize DVR/NVR monitoring if database connectivity is available
  if (pool) {
    try {
      const dvrNvrMonitorService = new DVRNVRMonitorService(pool);
      await dvrNvrMonitorService.start();
      app.addHook("onClose", async () => dvrNvrMonitorService.stop());
      await registerDVRNVRMonitorRoutes(app, dvrNvrMonitorService, pool);
      app.log.info("DVR/NVR monitor service started and routes registered");
    } catch (error) {
      app.log.error({ error }, "Failed to initialize DVR/NVR monitor service");
    }
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: "invalid_request",
        details: error.flatten(),
      });
    }
    if (error instanceof Error && error.message === "invalid_parent") {
      return reply.code(400).send({ error: "invalid_parent" });
    }
    if (
      error instanceof Error &&
      [
        "invalid_camera_grant_target",
        "invalid_camera_access_target",
        "invalid_time_restriction_target",
      ].includes(error.message)
    ) {
      return reply.code(400).send({ error: error.message });
    }
    if (error instanceof Error && error.message === "camera_not_found") {
      return reply.code(404).send({ error: "camera_not_found" });
    }
    if (error instanceof Error && error.message === "invalid_alert_transition") {
      return reply.code(409).send({ error: "invalid_alert_transition" });
    }
    const databaseCode = (error as { code?: string }).code;
    if (databaseCode === "23505") {
      return reply.code(409).send({ error: "resource_conflict" });
    }
    if (
      databaseCode === "23503" ||
      databaseCode === "23514" ||
      databaseCode === "22P02" ||
      databaseCode === "P0001"
    ) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  return app;
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function secureEqualHeader(value: string | string[] | undefined, expected: string) {
  return typeof value === "string" && secureEqual(value, expected);
}

function isEdgeAgentIngressRoute(method: string, url: string) {
  const path = url.split("?", 1)[0] ?? url;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/heartbeat$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/edge-agents\/[^/]+\/cameras\/monitoring$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/edge-agents\/[^/]+\/scan-jobs\/next$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/scan-jobs\/[^/]+\/complete$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/(?:telemetry|recorder-hdd|recorder-archive)$/.test(path)) return true;
  return method === "POST" && /^\/v1\/branches\/[^/]+\/cameras\/discovered$/.test(path);
}

function safeCamera(camera: Camera) {
  const { connectionSecretRef: _secret, ...safe } = camera;
  return safe;
}

async function requireAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: Action,
  resourceNodeId: string,
) {
  const decision = await store.checkAccess(
    request.currentUser,
    action,
    resourceNodeId,
  );
  if (!decision) {
    await reply.code(404).send({ error: "resource_not_found" });
    return false;
  }
  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return false;
  }
  return true;
}

async function requireCameraAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  camera: Camera,
) {
  if (!hasExtendedInfrastructure(store)) {
    return requireAccess(request, reply, store, "live:view", camera.nodeId);
  }

  const decision = await store.checkCameraAccess(
    request.currentUser.id,
    camera.id,
    "live:view",
  );
  if (decision.allowed) return true;

  await reply.code(403).send({
    error: decision.requiresApproval ? "approval_required" : "forbidden",
    reason: decision.reason,
    requiresApproval: decision.requiresApproval,
  });
  return false;
}

async function requireCameraActionAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  camera: Camera,
  action: Action,
) {
  if (!hasExtendedInfrastructure(store)) {
    return requireAccess(request, reply, store, action, camera.nodeId);
  }
  const decision = await store.checkCameraAccess(
    request.currentUser.id,
    camera.id,
    action,
  );
  if (decision.allowed) return true;
  await reply.code(403).send({
    error: decision.requiresApproval ? "approval_required" : "forbidden",
    reason: decision.reason,
    requiresApproval: decision.requiresApproval,
  });
  return false;
}

function requireRecordingEngineIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
  expected: string | undefined,
) {
  if (!expected) {
    void reply.code(503).send({ error: "recording_engine_not_configured" });
    return false;
  }
  const supplied = request.headers["x-recording-engine-key"];
  if (typeof supplied !== "string" || !secureEqual(supplied, expected)) {
    void reply.code(401).send({ error: "invalid_recording_engine_identity" });
    return false;
  }
  return true;
}

async function audit(
  request: FastifyRequest,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string | null,
  outcome: "success" | "denied" | "failure",
  details?: Record<string, unknown>,
) {
  await store.writeAudit({
    tenantId: request.currentUser.tenantId,
    actorUserId: request.currentUser.id,
    action,
    resourceNodeId,
    outcome,
    sourceIp: request.ip,
    ...(details ? { details } : {}),
  });
}

/**
 * Start background export worker for forensic evidence processing
 */
function startExportWorker(
  app: FastifyInstance,
  worker: ExportWorker,
  pool: any,
) {
  const interval = parseInt(process.env.EXPORT_WORKER_INTERVAL || "10000", 10);
  
  const processExports = async () => {
    try {
      const pending = await pool.query(
        `SELECT id FROM forensic_export_jobs 
         WHERE status IN ('pending', 'queued')
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`
      );
      
      for (const job of pending.rows) {
        try {
          await worker.processExport(job.id);
        } catch (error) {
          app.log.error({ error, jobId: job.id }, "Export job processing failed");
        }
      }
    } catch (error) {
      app.log.error({ error }, "Export worker error");
    }
  };

  const intervalId = setInterval(processExports, interval);
  
  app.addHook('onClose', async () => {
    clearInterval(intervalId);
  });
  
  app.log.info({ interval }, "Export worker started");
}
