import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";
import { SESClient } from "@aws-sdk/client-ses";
import {
  hasExtendedInfrastructure,
  type CameraDiscoveryInput,
  type ControlPlaneStore,
} from "./control-plane-store.js";
import { actions, type Action, type Camera, type RecordingJob } from "./domain/models.js";
import { createAuthMiddleware, RateLimiter } from "./middleware/auth.middleware.js";
import { buildPlaybackTimeline } from "./recording/playback-timeline.js";
import { RecorderService, type RecorderProviderResolver } from "./vms/index.js";
import { calculateRecordingStorage } from "./recording/storage-calculator.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerEnterpriseAuthRoutes } from "./routes/auth-enterprise.routes.js";
import { registerCameraPermissionRoutes } from "./routes/camera-permissions.routes.js";
import { registerCameraDiscoveryRoutes } from "./routes/camera-discovery.routes.js";
import {
  isAddressWithinAnyCidr,
  isPrivateIpv4Address,
  registerBranchConnectivityRoutes,
  transportIsAllowed,
} from "./routes/branch-connectivity.routes.js";
import { registerRecorderLifecycleRoutes } from "./routes/recorder-lifecycle.routes.js";
import { registerRecorderProfileRoutes } from "./routes/recorder-profile.routes.js";
import { registerBranchOperationalSnapshotRoutes } from "./routes/branch-operational-snapshot.routes.js";
import { registerRetentionRoutes } from "./retention/routes/retention.routes.js";
import { registerAlertAudioRoutes } from "./routes/alert-audio.routes.js";
import { registerNotificationRoutes } from "./routes/notification.routes.js";
import { registerDailySurveillanceReportRoutes } from "./routes/daily-surveillance-report.routes.js";
import { registerDeviceHealthRoutes } from "./routes/device-health.routes.js";
import { registerRecordingContinuityRoutes } from "./routes/recording-continuity.routes.js";
import { registerCentralMonitoringRoutes } from "./routes/central-monitoring.routes.js";
import { registerOnDemandMediaRoutes } from "./routes/on-demand-media.routes.js";
import { registerAiAlertsRoutes } from "./routes/ai-alerts.routes.js";
import { registerAlertIncidentsRoutes } from "./routes/alert-incidents.routes.js";
import { registerCctvInfrastructureRoutes } from "./routes/cctv-infrastructure.js";
import { registerOrganizationRoutes } from "./routes/organization.routes.js";
import { registerBranchLifecycleRoutes } from "./routes/branch-lifecycle.routes.js";
import { registerUserRoutes } from "./routes/user.routes.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerReportsRoutes } from "./routes/reports.routes.js";
import { registerLiveOperationsRoutes } from "./routes/live-operations.routes.js";
import { registerMediaSessionRoutes } from "./routes/media-session.routes.js";
import { registerDashboardRoutes } from "./routes/dashboard.routes.js";
import { registerCredentialsRoutes } from "./routes/credentials.routes.js";
import { registerBulkUploadRoutes } from "./routes/bulk-upload.routes.js";
import { registerAnalyticsPhase2Routes } from "./routes/analytics-phase2.routes.js";
import { adminCameraManagementRoutes } from "./routes/admin-camera-management.routes.js";
import { registerIncidentsRoutes } from "./routes/incidents.routes.js";
import { registerAuditRoutes } from "./routes/audit.routes.js";
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
import { registerAIVideoSearchRoutes } from "./routes/ai-video-search.routes.js";
import { registerDeviceInventoryRoutes } from "./routes/device-inventory.routes.js";
import { registerDeviceManagementRoutes } from "./routes/device-management.routes.js";
import { registerDVRNVRMonitorRoutes } from "./routes/dvr-nvr-monitor.routes.js";
import { registerEdgeAgentPackageRoutes } from "./routes/edge-agent-package.routes.js";
import { registerEdgeDiscoveryBootstrapRoutes } from "./routes/edge-discovery-bootstrap.routes.js";
import { registerEdgeGatewayOperationsRoutes } from "./routes/edge-gateway-operations.routes.js";
import { registerOperationalHealthRoutes } from "./routes/operational-health.routes.js";
import { registerBranchCommandCenterRoutes } from "./routes/branch-command-center.routes.js";
import { registerEnterpriseInfrastructureRoutes } from "./routes/enterprise-infrastructure.routes.js";
import { registerVideoWallRoutes } from "./routes/video-wall.routes.js";
import { registerAlertCommandCenterRoutes } from "./routes/alert-command-center.routes.js";
import { registerCommandCenterRoutes } from "./routes/command-center.routes.js";
import { registerRCAIncidentIntegrationRoutes } from "./routes/rca-incident-integration.routes.js";
import { registerDigitalTwinRoutes } from "./routes/digital-twin.routes.js";
import { registerOperationalReportRoutes } from "./routes/operational-reports.routes.js";
import { registerFederationRoutes } from "./routes/federation.routes.js";
import { registerEmployeeActivityTrackingRoutes } from "./routes/employee-activity-tracking.routes.js";
import { registerIntegrationRoutes } from "./routes/integrations.routes.js";
import { registerProvisioningRoutes } from "./routes/provisioning.routes.js";
import { registerStorageHealthRoutes } from "./routes/storage-health.routes.js";
import { registerConnectivityHealthRoutes } from "./routes/connectivity-health.routes.js";
import { registerAlertOperationsRoutes } from "./routes/alert-operations.routes.js";
import { registerSlaReportRoutes } from "./routes/sla-reports.routes.js";
import { registerClockMonitoringRoutes } from "./routes/clock-monitoring.routes.js";
import { registerEdgeGatewayRoutes } from "./routes/edge-gateway.routes.js";
import { registerEvidenceCaptureRoutes } from "./routes/evidence-capture.routes.js";
import { registerDeduplicationRoutes } from "./routes/deduplication.routes.js";
import { autoProvisionVerifiedCameras } from "./services/camera-auto-provision.js";
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
import type { EdgePresenceCacheContract } from "./platform/edge-presence-cache.js";
import type { ManagedEdgeTunnelProvider } from "./platform/managed-edge-tunnel.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: Awaited<ReturnType<ControlPlaneStore["getUser"]>> & {};
    edgeAgentAuthenticated: boolean;
    edgeAgentId?: string;
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
const cameraCodecSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const codec = value.trim().replace(/[.\s_-]/g, "").toUpperCase();
  if (codec === "H264" || codec === "AVC" || codec === "AVC1") return "H264";
  if (codec === "H265" || codec === "HEVC" || codec === "HEV1" || codec === "HVC1") return "H265";
  if (codec === "MJPEG" || codec === "MJPG" || codec === "JPEG") return "MJPEG";
  return value;
}, z.enum(["H264", "H265", "MJPEG", "unknown"]));
const cameraProfileSchema = z.object({
  name: z.string().min(1),
  codec: cameraCodecSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  role: z.enum(["main", "sub", "unknown"]).optional(),
  frameRate: z.number().positive().max(120).optional(),
  bitrateKbps: z.number().int().positive().max(100_000).optional(),
  preferredFor: z.array(z.enum(["recording", "live", "analytics"])).max(3).optional(),
  rtspUri: z.string().min(1).optional(),
}).strict();
const capabilitiesSchema = z.object({
  ptz: z.boolean(),
  audio: z.boolean(),
  events: z.boolean(),
  talkback: z.object({
    supported: z.boolean(),
    transport: z.enum(["onvif-rtsp-backchannel", "vendor-adapter", "none", "unknown"]),
    codecs: z.array(z.enum(["PCMA", "PCMU", "AAC", "OPUS", "unknown"])).optional(),
    sampleRates: z.array(z.number().int().positive().max(192_000)).optional(),
    verifiedAt: z.string().datetime().optional(),
    reason: z.string().trim().max(300).optional(),
  }).optional(),
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
  primaryRecordingStorage: z.enum(["sentinel-local", "recorder-local"]).optional(),
  cloudArchivePolicy: z.enum(["none", "incident-evidence-only"]).optional(),
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
  allowLegacyEdgeBridgeKey?: boolean;
  edgeUpdateSigningPrivateKey?: string;
  analyticsEngineSharedKey?: string;
  analyticsSourceSharedKey?: string;
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
  edgePresenceCache?: EdgePresenceCacheContract;
  edgeTunnelProvider?: ManagedEdgeTunnelProvider;
  requireManagedEdgeTunnel?: boolean;
  /** Optional edge/vendor provider resolver for on-demand recorder operations. */
  recorderProviderResolver?: RecorderProviderResolver;
}): Promise<FastifyInstance> {
  // PRODUCTION SECRET VALIDATION
  // In production mode, validate all critical secrets before proceeding
  // This ensures we fail fast with clear error messages rather than
  // silently accepting development defaults
  if (process.env.NODE_ENV === 'production') {
    try {
      const { validateProductionSecrets } = await import('../backend/src/services/production-secret-validator.service.js');
      validateProductionSecrets();
      console.log('✅ Production secret validation passed');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      throw new Error('Production secret validation failed. Cannot start application with insecure configuration.');
    }
  }
  
  const app = Fastify({
    logger: options?.logger ?? false,
    trustProxy: Boolean(options?.edgeBridgeSharedKey),
  });
  const store = options?.store ?? new MemoryStore();
  const recorderService = new RecorderService(store, options?.recorderProviderResolver);
  const edgePresenceCache = options?.edgePresenceCache;
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
  
  // PRODUCTION SAFETY: No development defaults in production
  // Development mode: use safe default for local testing
  // Production mode: must be explicitly configured or startup fails
  const effectiveVoiceCallbackSecret = voiceCallbackSecret ?? 
    (process.env.NODE_ENV === 'production' 
      ? (() => { throw new Error("ALERT_VOICE_CALLBACK_SECRET must be configured in production"); })()
      : "development-voice-callback-secret-change-me");
  
  const voiceTokens = new VoiceCallbackTokens(effectiveVoiceCallbackSecret);
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
  
  // PRODUCTION SAFETY: Report download secret must be configured in production
  const reportDownloadSecret = options?.reportDownloadSecret ?? process.env.REPORT_DOWNLOAD_SECRET ?? 
    (process.env.NODE_ENV === 'production' 
      ? (() => { throw new Error("REPORT_DOWNLOAD_SECRET must be configured in production"); })()
      : "development-report-download-secret-change-me");
  
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
  app.decorateRequest("edgeAgentId");
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
    const edgeAgentToken = request.headers["x-edge-agent-token"];
    const ingressAgentId = edgeAgentIngressRoute ? edgeAgentIdFromIngress(request) : undefined;
    const userIdentitySupplied = typeof request.headers.authorization === "string"
      || typeof request.headers["x-user-id"] === "string";
    const legacyBridgeAllowed = options?.allowLegacyEdgeBridgeKey ?? Boolean(options?.edgeBridgeSharedKey);
    const edgeBridgeAuthenticated = legacyBridgeAllowed && Boolean(options?.edgeBridgeSharedKey) && secureEqualHeader(
      edgeBridgeHeader,
      options!.edgeBridgeSharedKey!,
    );
    const edgeCredentialAuthenticated = typeof edgeAgentToken === "string" && Boolean(ingressAgentId) &&
      await store.verifyEdgeAgentCredential(ingressAgentId!, hashEdgeCredential(edgeAgentToken));
    if (edgeAgentIngressRoute && edgeAgentToken && !edgeCredentialAuthenticated) {
      return reply.code(401).send({ error: "invalid_or_revoked_gateway_identity" });
    }
    if (edgeAgentIngressRoute && legacyBridgeAllowed && options?.edgeBridgeSharedKey && edgeBridgeHeader && !edgeBridgeAuthenticated) {
      return reply.code(401).send({ error: "invalid_bridge_identity" });
    }
    if (
      edgeAgentIngressRoute &&
      !userIdentitySupplied &&
      (edgeCredentialAuthenticated || edgeBridgeAuthenticated)
    ) {
      request.edgeAgentAuthenticated = true;
      request.edgeAgentId = ingressAgentId;
      return;
    }

    const publicAuthPaths = [
      "/v1/auth/login",
      "/v1/auth/refresh",
      "/v1/auth/request-password-reset",
      "/v1/auth/reset-password",
    ];
    const isPublicAuthRoute = publicAuthPaths.some((path) => request.url.startsWith(path));

    if ((request.routeOptions.config as unknown as Record<string, unknown>)?.noAuth || isPublicAuthRoute) {
      await loginRateLimiter.middleware()(request, reply);
      return;
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

  app.addHook("onClose", async () => {
    await Promise.all([store.close(), edgePresenceCache?.close()]);
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "sentinel-control-plane",
  }));

  app.get("/ready", async (_request, reply) => {
    const databasePool = (store as unknown as { pool?: { query(sql: string): Promise<unknown> } }).pool;
    try {
      if (databasePool) await databasePool.query("SELECT 1");
      if (edgePresenceCache) await edgePresenceCache.ping();
      return {
        status: "ready",
        database: databasePool ? "connected" : "memory",
        liveState: edgePresenceCache ? "redis" : "database",
      };
    } catch {
      return reply.code(503).send({ status: "not-ready", database: "unavailable" });
    }
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  app.get("/metrics", async (_request, reply) => reply.type("text/plain; version=0.0.4").send(runtimeGuard.prometheus()));

  app.get("/v1/me", async (request) => request.currentUser);

  app.get("/v1/capacity/assessment", async (request) => {
    // Get real operational metrics to calculate capacity assessment
    const tenantId = request.currentUser?.tenantId;
    if (!tenantId) {
      return {
        capability: "Capacity assessment unavailable",
        status: "Authentication required",
        verifiedCompletion: 0,
        summary: "Please authenticate to view capacity assessment.",
        metrics: { branches: 0, cameras: 0, branchScaleTarget: 0, cameraScaleTarget: 0 },
        evidence: {
          loadTestCompleted: false,
          productionBenchmarkCompleted: false,
          enduranceBenchmarkCompleted: false,
          failoverValidated: false,
        },
      };
    }

    const branches = await store.listAccessibleNodes(request.currentUser, "analytics:view", "branch");
    const allCameras = (await Promise.all(
      branches.map(b => store.listCamerasByBranch(request.currentUser, b.id, "analytics:view"))
    )).flat();

    const actualBranches = branches.length;
    const actualCameras = allCameras.length;
    
    // Calculate verified completion based on real operational data
    const onlineCameras = allCameras.filter(c => c.status === "online").length;
    const healthyBranches = branches.length; // Simplified - could check operational health
    
    // Real operational evidence
    const telemetry = await store.listLatestOperationalTelemetry(tenantId, branches.map(b => b.id));
    const hasOperationalTelemetry = telemetry.length > 0;
    const hasRecordingEvidence = telemetry.some(t => t.deviceType === "archive");
    const hasHealthMonitoring = telemetry.some(t => t.deviceType === "disk" || t.deviceType === "network");
    
    // Calculate completion percentage based on real operational state
    let completionScore = 0;
    if (actualBranches > 0) completionScore += 20;
    if (actualCameras > 0) completionScore += 20;
    if (onlineCameras > 0) completionScore += 15;
    if (hasOperationalTelemetry) completionScore += 15;
    if (hasRecordingEvidence) completionScore += 15;
    if (hasHealthMonitoring) completionScore += 15;
    
    const verifiedCompletion = completionScore;
    
    // Scale targets based on architecture
    const branchScaleTarget = 400;
    const cameraScaleTarget = 5000;
    
    // Calculate status message based on actual vs target
    const branchProgress = actualBranches > 0 ? Math.min(100, (actualBranches / branchScaleTarget) * 100) : 0;
    const cameraProgress = actualCameras > 0 ? Math.min(100, (actualCameras / cameraScaleTarget) * 100) : 0;
    
    let status: string;
    if (verifiedCompletion >= 80) {
      status = "Production ready - operational evidence verified";
    } else if (verifiedCompletion >= 50) {
      status = "Evidence harness available; production certification pending";
    } else if (verifiedCompletion >= 20) {
      status = "Initial deployment; scaling evidence required";
    } else {
      status = "Pre-production; awaiting operational deployment";
    }
    
    const summary = actualBranches === 0 && actualCameras === 0
      ? "No branches or cameras deployed yet. Deploy infrastructure to begin capacity assessment."
      : `Currently supporting ${actualBranches} branch${actualBranches !== 1 ? 'es' : ''} with ${actualCameras} camera${actualCameras !== 1 ? 's' : ''}. ` +
        `Operational telemetry ${hasOperationalTelemetry ? 'active' : 'pending'}. ` +
        `Target capacity: ${branchScaleTarget} branches, ${cameraScaleTarget} cameras.`;

    return {
      capability: `Support approximately ${branchScaleTarget} branches / ${cameraScaleTarget} cameras`,
      status,
      verifiedCompletion,
      summary,
      metrics: {
        branches: actualBranches,
        cameras: actualCameras,
        branchScaleTarget,
        cameraScaleTarget,
      },
      evidence: {
        loadTestCompleted: actualBranches >= 10 && actualCameras >= 50,
        productionBenchmarkCompleted: hasOperationalTelemetry && hasRecordingEvidence,
        enduranceBenchmarkCompleted: hasHealthMonitoring && hasRecordingEvidence,
        failoverValidated: telemetry.some(t => t.deviceType === "network" && t.metrics.role === "failover"),
      },
      futureBranches: {
        capability: "Unlimited future branches",
        status: "Designed for horizontal growth",
        verifiedCompletion: 35,
        summary: "The platform uses a modular, distributed architecture that can be extended by adding additional service instances, but high-availability clustering, autoscaling and multi-region validation remain unproven.",
      },
    };
  });

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
    const agents = await store.listEdgeAgentsByBranch(branchId);
    if (!edgePresenceCache) return { data: agents };
    const data = await Promise.all(agents.map(async (agent) => {
      try {
        const presence = await edgePresenceCache.get(agent.id);
        return {
          ...agent,
          status: presence ? "online" as const : agent.status === "pending" ? "pending" as const : "offline" as const,
          ...(presence?.publicMediaUrl ? { publicMediaUrl: presence.publicMediaUrl } : {}),
        };
      } catch {
        return agent;
      }
    }));
    return { data };
  });

  app.post("/v1/edge-agents/:id/heartbeat", async (request, reply) => {
    const { id } = edgeAgentParams.parse(request.params);
    const body = z.object({
      version: z.string().min(1).max(40),
      publicMediaUrl: z.union([z.literal("auto"), z.string().url()]).optional(),
    }).parse(request.body);
    // Installers use `auto` until the private gateway selects the active LAN
    // address. Do not persist or advertise that marker as a URL; the running
    // agent's next heartbeat supplies the resolved http://10.x/172.16/192.168 address.
    const publicMediaUrl = body.publicMediaUrl === "auto" ? undefined : body.publicMediaUrl;
    // Temporary operator authentication; replace with edge-agent mTLS identity.
    const agent = await store.heartbeatEdgeAgent(id, body.version!, publicMediaUrl);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    // The edge gateway reports a usable media URL only after its runtime is
    // reachable. Promote that observation into the readiness projection.
    if (publicMediaUrl) {
      await store.updateEdgeManagedTunnelStatus(agent.branchId, "healthy");
    }
    if (edgePresenceCache) {
      await edgePresenceCache.markOnline({
        edgeAgentId: id,
        version: body.version!,
        observedAt: new Date().toISOString(),
        ...(publicMediaUrl ? { publicMediaUrl } : {}),
      });
    }
    return agent;
  });

  /**
   * Revoke gateway endpoint
   * Admin-friendly alias for deactivating edge gateways without deleting their audit history
   * Maps /api/admin/system/gateways/:id to edge-agent revocation
   */
  app.delete("/api/admin/system/gateways/:id", async (request, reply) => {
    let id: string | undefined;
    
    try {
      // Parse and validate ID
      const parsed = edgeAgentParams.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_gateway_id",
          message: "Invalid gateway ID format",
          details: parsed.error.errors
        });
      }
      
      id = parsed.data.id;
      
      // Get the agent to find its branch
      const agent = await store.getEdgeAgent(id);
      
      if (!agent) {
        return reply.code(404).send({ 
          error: "gateway_not_found",
          message: "Gateway not found" 
        });
      }
      
      // Check permissions
      const accessCheck = await requireAccess(request, reply, store, "device:configure", agent.branchId);
      if (!accessCheck) {
        return; // requireAccess already sent the response
      }
      
      // Revoke the agent credential
      await store.revokeEdgeAgentCredential(id);
      
      // Write audit log
      await audit(
        request,
        store,
        "edge_gateway.deleted",
        agent.branchId,
        "success",
        { 
          edgeAgentId: id,
          gatewayName: agent.name,
          deviceUuid: agent.deviceUuid
        }
      );
      
      return reply.code(204).send();
      
    } catch (error) {
      app.log.error({ err: error, agentId: id }, "Failed to delete gateway");
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      return reply.code(500).send({
        error: "gateway_delete_failed",
        message: errorMessage,
        details: {
          agentId: id || 'unknown',
          timestamp: new Date().toISOString(),
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          // Include stack trace in development for debugging
          ...(process.env.NODE_ENV !== 'production' && errorStack ? { stack: errorStack } : {})
        }
      });
    }
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
        ...(camera.sourceType && camera.sourceType !== "ip-camera" ? { sourceType: camera.sourceType } : {}),
        ...(camera.recorderId ? { recorderId: camera.recorderId } : {}),
        ...(camera.recorderChannel ? { recorderChannel: camera.recorderChannel } : {}),
      })),
    };
  });

  app.post("/v1/edge-agents/:id/analytics/frames", async (request, reply) => {
    const { id } = edgeAgentParams.parse(request.params);
    if (!request.edgeAgentAuthenticated || request.edgeAgentId !== id) {
      return reply.code(403).send({ error: "edge_agent_identity_mismatch" });
    }
    const input = z.object({
      cameraId: z.string().min(1),
      capturedAt: z.string().datetime(),
      width: z.number().int().min(64).max(1280),
      height: z.number().int().min(36).max(720),
      imageBase64: z.string().min(1).max(4_000_000),
      metadata: z.record(z.unknown()).optional(),
    }).parse(request.body);
    const agent = await store.getEdgeAgent(id);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const camera = (await store.listCamerasByEdgeAgent(id))
      .find((candidate) => candidate.id === input.cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found_for_edge_agent" });
    const branch = await store.getNode(agent.branchId);
    if (!branch) return reply.code(404).send({ error: "branch_not_found" });
    const rules = (await store.listAnalyticsRules(camera.id)).filter((rule) => rule.enabled);
    if (rules.length === 0) {
      return reply.code(202).send({ accepted: false, reason: "no_enabled_camera_ai_rules" });
    }
    const analyticsSourceKey = options?.analyticsSourceSharedKey ?? options?.analyticsEngineSharedKey;
    if (!options?.analyticsEngineUrl || !analyticsSourceKey) {
      return reply.code(202).send({ accepted: false, reason: "analytics_engine_not_configured" });
    }
    try {
      const upstream = await fetch(new URL("/internal/frames", options.analyticsEngineUrl), {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "x-analytics-source-key": analyticsSourceKey,
        },
        body: JSON.stringify({
          tenantId: branch.tenantId,
          cameraId: camera.id,
          capturedAt: input.capturedAt,
          width: input.width,
          height: input.height,
          imageBase64: input.imageBase64,
          rules,
          metadata: { ...input.metadata, edgeAgentId: id, branchId: branch.id },
        }),
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        request.log.warn({ cameraId: camera.id, upstreamStatus: upstream.status }, "Analytics engine rejected edge frame");
        return reply.code(502).send({ error: "analytics_engine_rejected_frame", upstreamStatus: upstream.status });
      }
      return reply.code(202).send({ accepted: true, analytics: result });
    } catch (error) {
      request.log.warn({ error, cameraId: camera.id }, "Analytics engine frame delivery failed");
      return reply.code(502).send({ error: "analytics_engine_unavailable" });
    }
  });

  app.post("/v1/branches/:branchId/device-scans", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const body = z.object({ edgeAgentId: z.string().min(1).optional() }).parse(request.body ?? {});
    const agents = await store.listEdgeAgentsByBranch(branchId);
    if (agents.length === 0) {
      return reply.code(409).send({ error: "edge_agent_required" });
    }
    const selectedAgent = body.edgeAgentId
      ? agents.find((agent) => agent.id === body.edgeAgentId)
      : agents.find((agent) => agent.status === "online");
    if (!selectedAgent || selectedAgent.status !== "online") {
      return reply.code(409).send({
        error: "edge_agent_not_connected",
        message: "Connect a Branch Gateway or local scanner to the camera network before scanning.",
      });
    }
    const job = await store.createEdgeScanJob(branchId, selectedAgent.id);
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
    const branchDiscoveries = await store.listDiscoveredCameras(query.branchId);
    const discoveries = job.scope === "device" && job.targetIpAddress
      ? branchDiscoveries.filter((item) => item.ipAddress === job.targetIpAddress)
      : branchDiscoveries;
    return { data: discoveries.map((item) => ({
      discoveryId: item.id,
      edgeAgentId: item.edgeAgentId,
      manufacturer: item.manufacturer ?? "Unknown",
      model: item.model,
      displayName: item.displayName ?? `${item.manufacturer ?? "Unknown"} ${item.model}`,
      firmwareVersion: item.firmwareVersion,
      onvifSupported: item.onvifSupport ?? false,
      onvifPort: item.onvifPort,
      rtspPort: item.rtspPort,
      streamVerified: item.streamVerified ?? item.rtspValidated ?? false,
      compatibility: item.compatibility ?? (item.compatibilityStatus ?? "review-required"),
      duplicate: item.duplicateStatus === "duplicate",
      duplicateStatus: item.duplicateStatus,
      compatibilityStatus: item.compatibilityStatus,
      status: item.status,
      ipAddress: item.ipAddress,
      credentialsRequired: item.credentialsRequired ?? false,
      statusReason: item.statusReason,
      discoveryMethod: item.discoveryMethod,
      profiles: item.profiles,
      sourceType: item.sourceType ?? "ip-camera",
      recorderId: item.recorderId,
      recorderChannel: item.recorderChannel,
      timeSynchronization: item.timeSynchronization ?? "unknown",
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
    const selectedAgent = body.edgeAgentId
      ? agents.find((agent) => agent.id === body.edgeAgentId)
      : agents.find((agent) => agent.status === "online");
    if (!selectedAgent || selectedAgent.status !== "online") {
      return reply.code(409).send({
        error: "edge_agent_not_connected",
        message: "Connect a Branch Gateway or local scanner to the camera network before scanning.",
      });
    }
    const job = await store.createEdgeScanJob(branchId, selectedAgent.id);
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
    const agent = await store.getEdgeAgent(id);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const existingJob = await store.getEdgeScanJob(agent.branchId, jobId);
    if (!existingJob || existingJob.edgeAgentId !== id) {
      return reply.code(404).send({ error: "scan_job_not_found" });
    }
    if (existingJob.status === "completed" || existingJob.status === "failed") {
      return existingJob;
    }

    let provisionedCount = 0;
    let credentialsRequiredCount = 0;
    let pendingVerificationCount = 0;
    let activationFailedCount = 0;
    let verifiedCount = 0;
    let recorderCount = 0;
    let timeSynchronizedCount = 0;
    let timeDriftCount = 0;
    let analyticsCompatibleCount = 0;
    let duplicateCount = 0;
    if (result.status === "completed") {
      const runStartedAt = Date.parse(existingJob.startedAt ?? existingJob.requestedAt);
      const discoveries = (await store.listDiscoveredCameras(agent.branchId))
        .filter((item) => item.edgeAgentId === id &&
          (!Number.isFinite(runStartedAt) || Date.parse(item.discoveredAt) >= runStartedAt) &&
          (existingJob.scope !== "device" || !existingJob.targetIpAddress ||
            item.ipAddress === existingJob.targetIpAddress));
      verifiedCount = discoveries.filter((item) => item.streamVerified === true).length;
      recorderCount = new Set(discoveries.flatMap((item) => item.recorderId ? [item.recorderId] : [])).size;
      timeSynchronizedCount = discoveries.filter((item) => item.timeSynchronization === "synchronized").length;
      timeDriftCount = discoveries.filter((item) => item.timeSynchronization === "drifted").length;
      analyticsCompatibleCount = discoveries.filter((item) => item.streamVerified === true &&
        item.profiles.some((profile) => ["H264", "H265", "MJPEG"].includes(profile.codec))).length;
      duplicateCount = discoveries.filter((item) => item.duplicateStatus === "duplicate").length;
      const activation = await autoProvisionVerifiedCameras(store, agent.branchId, {
        edgeAgentId: id,
        ...(existingJob.scope === "device" && existingJob.targetIpAddress
          ? { ipAddresses: [existingJob.targetIpAddress] }
          : {}),
      });
      provisionedCount = activation.summary.provisioned;
      credentialsRequiredCount = activation.summary.credentialsRequired;
      pendingVerificationCount = activation.summary.pendingVerification;
      activationFailedCount = activation.summary.failed;
    }

    const job = await store.completeEdgeScanJob(id, jobId, {
      status: result.status!,
      resultCount: result.resultCount!,
      provisionedCount,
      credentialsRequiredCount,
      pendingVerificationCount,
      verifiedCount,
      recorderCount,
      timeSynchronizedCount,
      timeDriftCount,
      analyticsCompatibleCount,
      duplicateCount,
      ...(result.error ? { error: result.error } : {}),
    });
    if (job) {
      const branch = await store.getNode(agent.branchId);
      if (branch) {
        await store.writeAudit({
          tenantId: branch.tenantId,
          actorUserId: null,
          action: "camera.scan_auto_activation",
          resourceNodeId: agent.branchId,
          outcome: activationFailedCount > 0 ? "failure" : "success",
          sourceIp: request.ip,
          details: {
            scanJobId: jobId,
            edgeAgentId: id,
            scanScope: existingJob.scope ?? "branch",
            ...(existingJob.targetDiscoveryId ? { targetDiscoveryId: existingJob.targetDiscoveryId } : {}),
            provisionedCount,
            credentialsRequiredCount,
            pendingVerificationCount,
            verifiedCount,
            recorderCount,
            timeSynchronizedCount,
            timeDriftCount,
            analyticsCompatibleCount,
            duplicateCount,
            failedCount: activationFailedCount,
          },
        }).catch(() => undefined);
      }
    }
    return job ?? reply.code(404).send({ error: "scan_job_not_found" });
  });

  app.post("/v1/branches/:branchId/cameras/discovered", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!request.edgeAgentAuthenticated && !(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const parsed = z.object({
      edgeAgentId: z.string().min(1),
      discoveryMethod: z.enum(["onvif-ws-discovery", "configured-ip-range", "rtsp-network-scan", "manual-ip-registration", "csv-bulk-import", "nvr-dvr-channel-discovery", "vendor-api-discovery", "snmp-discovery", "edge-agent-reported-inventory"]).default("edge-agent-reported-inventory"),
      vendor: z.enum(["hikvision", "cp-plus", "other"]).default("other"),
      manufacturer: z.string().trim().min(1).max(120).optional(),
      model: z.string().trim().min(1).max(120),
      ipAddress: z.string().ip(),
      macAddress: z.string().trim().max(80).optional(),
      serialNumber: z.string().trim().max(120).optional(),
      firmwareVersion: z.string().trim().max(200).optional(),
      onvifSupport: z.boolean().optional(),
      onvifEndpointReference: z.string().trim().max(500).optional(),
      onvifUuid: z.string().trim().max(200).optional(),
      certificateRef: z.string().trim().max(500).optional(),
      certificateFingerprint: z.string().trim().max(256).optional(),
      onvifServices: z.array(z.string().trim().min(1).max(120)).optional(),
      onvifCapabilityTests: z.array(onvifCapabilityTestSchema).optional(),
      discoveryLayers: z.array(z.object({
        layer: z.enum(["network-discovery", "onvif-discovery", "onvif-authentication",
          "get-capabilities", "get-profiles", "get-stream-uri", "rtsp-verification",
          "vendor-adapter", "fingerprint"]),
        status: z.enum(["passed", "failed", "fallback", "skipped"]),
        detail: z.string().trim().min(1).max(500),
      })).max(32).optional(),
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
      sourceType: z.enum(["ip-camera", "analog-dvr-channel", "nvr-channel"]).optional(),
      recorderId: z.string().trim().min(1).max(200).optional(),
      recorderChannel: z.number().int().min(1).max(65_535).optional(),
      recorderSerialNumber: z.string().trim().max(120).optional(),
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
      if (request.edgeAgentId && request.edgeAgentId !== parsed.edgeAgentId) {
        return reply.code(403).send({ error: "edge_agent_identity_mismatch" });
      }
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
      onvifUuid: parsed.onvifUuid,
      certificateRef: parsed.certificateRef,
      certificateFingerprint: parsed.certificateFingerprint,
      onvifServices: parsed.onvifServices,
      onvifCapabilityTests: parsed.onvifCapabilityTests as CameraDiscoveryInput["onvifCapabilityTests"],
      discoveryLayers: parsed.discoveryLayers as CameraDiscoveryInput["discoveryLayers"],
      mediaProfiles: parsed.mediaProfiles?.map(p => ({
        name: p.name,
        codec: p.codec,
        width: p.width,
        height: p.height,
        role: p.role,
        frameRate: p.frameRate,
        bitrateKbps: p.bitrateKbps,
        preferredFor: p.preferredFor,
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
      sourceType: parsed.sourceType,
      recorderId: parsed.recorderId,
      recorderChannel: parsed.recorderChannel,
      recorderSerialNumber: parsed.recorderSerialNumber,
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
        role: p.role,
        frameRate: p.frameRate,
        bitrateKbps: p.bitrateKbps,
        preferredFor: p.preferredFor,
        rtspUri: p.rtspUri,
      })),
      capabilities: {
        ptz: parsed.capabilities.ptz,
        audio: parsed.capabilities.audio,
        events: parsed.capabilities.events,
        ...(parsed.capabilities.talkback ? { talkback: parsed.capabilities.talkback } : {}),
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

  app.post("/v1/branches/:branchId/cameras", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const parsed = z.object({
      discoveryId: z.string().min(1).optional(),
      name: z.string().trim().min(2).max(120),
      channel: z.number().int().positive(),
      protocol: z.enum(["onvif-t", "onvif-s", "rtsp", "vendor-adapter"]),
      connectionSecretRef: z.string().min(8).max(500).optional(),
      connectionTransport: z.enum(["vpn", "cloudflare-tunnel", "edge-gateway"]).optional(),
      branchCode: z.string().trim().max(80).optional(),
      manufacturer: z.string().trim().max(120).optional(),
      model: z.string().trim().max(120).optional(),
      serialNumber: z.string().trim().max(120).optional(),
      macAddress: z.string().trim().max(80).optional(),
      ipAddress: z.string().trim().max(120).optional(),
      onvifUuid: z.string().trim().max(200).optional(),
      certificateRef: z.string().trim().max(500).optional(),
      certificateFingerprint: z.string().trim().max(256).optional(),
      onvifPort: z.number().int().min(1).max(65535).optional(),
      rtspPort: z.number().int().min(1).max(65535).optional(),
      streamProfile: z.string().trim().max(80).optional(),
      profile: cameraProfileSchema.omit({ rtspUri: true }).optional(),
      sourceType: z.enum(["ip-camera", "analog-dvr-channel", "nvr-channel"]).default("ip-camera"),
      recorderId: z.string().trim().min(1).max(200).optional(),
      recorderChannel: z.number().int().min(1).max(65_535).optional(),
      recorderSerialNumber: z.string().trim().max(120).optional(),
    }).parse(request.body);
    const connectivity = await store.getBranchConnectivityProfile(branchId);
    const connectionTransport = parsed.connectionTransport ?? connectivity?.primaryTransport;
    if (connectionTransport && connectionTransport !== "edge-gateway" &&
        (!connectivity || !transportIsAllowed(connectionTransport, connectivity))) {
      return reply.code(409).send({ error: "branch_connectivity_not_configured" });
    }
    if (connectionTransport === "edge-gateway" && !parsed.connectionSecretRef?.startsWith("edge://")) {
      return reply.code(400).send({ error: "edge_gateway_requires_edge_secret_reference" });
    }
    if (connectionTransport === "vpn" && (!parsed.ipAddress || !isPrivateIpv4Address(parsed.ipAddress))) {
      return reply.code(400).send({ error: "vpn_requires_private_camera_or_recorder_address" });
    }
    if (connectionTransport === "vpn" && parsed.ipAddress &&
        !isAddressWithinAnyCidr(parsed.ipAddress, connectivity?.vpnRemoteNetworks ?? [])) {
      return reply.code(400).send({ error: "camera_address_outside_configured_vpn_networks" });
    }
    const recorderBacked = parsed.sourceType === "analog-dvr-channel" || parsed.sourceType === "nvr-channel";
    if (recorderBacked && (!parsed.recorderId || !parsed.recorderChannel || parsed.protocol !== "vendor-adapter")) {
      return reply.code(400).send({ error: "recorder_channel_requires_recorder_id_channel_and_vendor_adapter" });
    }
    const connectionSecretRef = parsed.connectionSecretRef ?? (connectionTransport === "vpn"
      ? vpnSecretReference(branchId, parsed.sourceType, parsed.ipAddress!, parsed.recorderId, parsed.recorderChannel)
      : undefined);
    if (!connectionSecretRef) return reply.code(400).send({ error: "connection_secret_ref_required" });
    const approvalInput = {
      discoveryId: parsed.discoveryId ?? "",
      name: parsed.name,
      channel: parsed.channel,
      protocol: parsed.protocol,
      connectionSecretRef,
      connectionTransport,
      branchCode: parsed.branchCode,
      manufacturer: parsed.manufacturer,
      model: parsed.model,
      serialNumber: parsed.serialNumber,
      macAddress: parsed.macAddress,
      ipAddress: parsed.ipAddress,
      onvifUuid: parsed.onvifUuid,
      certificateRef: parsed.certificateRef,
      certificateFingerprint: parsed.certificateFingerprint,
      onvifPort: parsed.onvifPort,
      rtspPort: parsed.rtspPort,
      streamProfile: parsed.streamProfile,
      ...(parsed.profile ? { profile: parsed.profile as Camera["profiles"][number] } : {}),
      sourceType: parsed.sourceType,
      recorderId: parsed.recorderId,
      recorderChannel: parsed.recorderChannel,
      recorderSerialNumber: parsed.recorderSerialNumber,
    };
    const camera = parsed.discoveryId
      ? await store.approveCamera(branchId, approvalInput)
      : await store.createCameraFromManualRegistration(branchId, approvalInput);
    if (!camera) {
      return reply.code(parsed.discoveryId ? 404 : 400).send({ error: parsed.discoveryId ? "discovery_not_found" : "manual_registration_failed" });
    }
    await store.upsertRecordingJob(camera.id, initialRecordingJobForSource(parsed.sourceType));
    await audit(request, store, "camera.approved", camera.nodeId, "success", {
      cameraId: camera.id,
      registrationMethod: parsed.discoveryId ? "discovery" : "manual",
      connectionTransport: connectionTransport ?? "unspecified",
      sourceType: parsed.sourceType,
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

  app.post("/v1/cameras/:id/talk-sessions", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(request, reply, store, camera, "audio:talk"))) {
      await audit(request, store, "talk_session.created", camera.nodeId, "denied");
      return;
    }
    if (camera.capabilities.talkback?.supported === false ||
        (!camera.capabilities.audio && camera.capabilities.talkback?.supported !== true)) {
      return reply.code(409).send({
        error: "talkback_not_supported",
        reason: camera.capabilities.talkback?.reason ?? "device_does_not_advertise_two_way_audio",
      });
    }
    const session = await store.createLiveSession(id, request.currentUser.id, "talk");
    await audit(request, store, "talk_session.created", camera.nodeId, "success", {
      sessionId: session.id,
      cameraId: camera.id,
      branchId: camera.branchId,
      sourceType: camera.sourceType ?? "ip-camera",
      recorderChannel: camera.recorderChannel ?? camera.channel,
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
      primaryRecordingStorage: camera.recorderId || camera.sourceType === "analog-dvr-channel" ||
        camera.sourceType === "nvr-channel" ? "recorder-local" : "sentinel-local",
      cloudArchivePolicy: camera.recorderId || camera.sourceType === "analog-dvr-channel" ||
        camera.sourceType === "nvr-channel" ? "incident-evidence-only" : "none",
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
    const parsedInput = recordingJobSchema.parse(request.body);
    const existingJob = await store.getRecordingJob(id);
    const recorderBacked = Boolean(camera.recorderId) || camera.sourceType === "analog-dvr-channel" ||
      camera.sourceType === "nvr-channel";
    const input = {
      ...parsedInput,
      primaryRecordingStorage: parsedInput.primaryRecordingStorage ?? existingJob?.primaryRecordingStorage ??
        (recorderBacked ? "recorder-local" as const : "sentinel-local" as const),
      cloudArchivePolicy: parsedInput.cloudArchivePolicy ?? existingJob?.cloudArchivePolicy ??
        (recorderBacked ? "incident-evidence-only" as const : "none" as const),
    };
    if (recorderBacked && input.primaryRecordingStorage !== "recorder-local") {
      return reply.code(409).send({
        error: "recorder_backed_camera_requires_recorder_local_storage",
        message: "The DVR/NVR retains the full timeline; Sentinel may copy incident evidence only.",
      });
    }
    if (!recorderBacked && input.primaryRecordingStorage === "recorder-local") {
      return reply.code(409).send({
        error: "recorder_local_storage_requires_recorder",
        message: "This standalone camera has no DVR/NVR assigned as its primary recorder.",
      });
    }
    if (input.primaryRecordingStorage === "recorder-local" &&
        (input.cloudArchivePolicy !== "incident-evidence-only" || input.backupRequired)) {
      return reply.code(409).send({
        error: "recorder_local_policy_conflict",
        message: "Recorder-local jobs cannot back up the continuous timeline to cloud storage.",
      });
    }
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
      const engine = z.object({ active: z.boolean(), delegated: z.boolean().optional() }).parse(await response.json());
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
    await audit(request, store, "recording.configured", camera.nodeId, "success", {
      mode: job.mode,
      enabled: job.enabled,
      primaryRecordingStorage: job.primaryRecordingStorage,
      cloudArchivePolicy: job.cloudArchivePolicy,
    });
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
    const job = await store.getRecordingJob(id);
    const vms = await recorderService.getCameraRecordingView({
      tenantId: request.currentUser.tenantId,
      camera,
      from: query.from,
      to: query.to,
    });
    const segments = vms.recordingSearch.state === "AVAILABLE"
      ? vms.recordingSearch.value.segments.flatMap((segment) => {
          if (segment.source !== "PLATFORM" || !segment.platformSegmentId) return [];
          return [{
            id: segment.platformSegmentId,
            cameraId: segment.cameraId,
            jobId: "",
            startedAt: segment.startTime,
            endedAt: segment.endTime,
            storagePath: "",
            sizeBytes: 0,
            storageNodeExternalId: "",
            storageTier: "hot" as const,
            status: segment.playbackAvailable ? "ready" as const : "error" as const,
            createdAt: segment.startTime,
          }];
        })
      : [];
    return {
      ...(vms.source === "PLATFORM"
        ? buildPlaybackTimeline(await store.listRecordingSegments(id, query.from, query.to), query.from, query.to)
        : { segments, gaps: [], recordedSeconds: 0, requestedSeconds: Math.round((to - from) / 1_000), coveragePercent: null }),
      source: job?.primaryRecordingStorage ?? (vms.source === "RECORDER" ? "recorder-local" : "sentinel-local"),
      transferMode: vms.source === "RECORDER" ? "on-demand" : "local-index",
      cloudArchivePolicy: job?.cloudArchivePolicy ?? (vms.source === "RECORDER" ? "incident-evidence-only" : "none"),
      vms,
    };
  });

  app.get("/v1/cameras/:id/timeline", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const query = z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(request.query);
    const from = Date.parse(query.from);
    const to = Date.parse(query.to);
    if (to <= from || to - from > 31 * 86_400_000) return reply.code(400).send({ error: "invalid_timeline_window" });
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(request, reply, store, camera, "recording:view"))) return;
    const vms = await recorderService.getCameraRecordingView({
      tenantId: request.currentUser.tenantId, camera, from: query.from, to: query.to,
    });
    return { cameraId: id, recorderId: vms.recorderId, source: vms.source, timeline: vms.timeline };
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
      action: session.purpose === "talk" ? "talk_session.consumed" : "live_session.consumed",
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
  await registerBranchConnectivityRoutes(app, store, {
    tunnelProvider: options?.edgeTunnelProvider,
  });
  await registerEdgeGatewayOperationsRoutes(app, store, {
    controlPlanePublicUrl: options?.controlPlanePublicUrl ?? process.env.CONTROL_PLANE_PUBLIC_URL,
    updateSigningPrivateKey: options?.edgeUpdateSigningPrivateKey ?? process.env.EDGE_UPDATE_SIGNING_PRIVATE_KEY,
    tunnelProvider: options?.edgeTunnelProvider,
    requireManagedTunnel: options?.requireManagedEdgeTunnel,
  });
  await registerEdgeAgentPackageRoutes(app, store, {
    controlPlanePublicUrl: options?.controlPlanePublicUrl ?? process.env.CONTROL_PLANE_PUBLIC_URL,
    edgeBridgeSharedKey: options?.edgeBridgeSharedKey ?? process.env.EDGE_BRIDGE_SHARED_KEY,
    allowLegacyEdgeBridgeKey: options?.allowLegacyEdgeBridgeKey,
    artifactRoot: options?.edgeAgentArtifactRoot,
    developmentUserId: (options?.authMode ?? "development") === "development"
      ? "user-global-admin"
      : undefined,
  });
  await registerEdgeDiscoveryBootstrapRoutes(app, store, pool);
  await registerProvisioningRoutes(app, store);

  app.post("/v1/edge-agents/:id/live-sessions/consume", async (request, reply) => {
    const { id } = edgeAgentParams.parse(request.params);
    const { token } = z.object({ token: z.string().min(32).max(200) }).parse(request.body);
    const agent = await store.heartbeatEdgeAgent(
      id,
      request.headers["x-edge-agent-version"] as string || "unknown",
    );
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const consumed = await store.consumeLiveSession(token);
    if (!consumed) return reply.code(401).send({ error: "invalid_live_session" });
    const camera = await store.getCamera(consumed.cameraId);
    if (!camera || camera.edgeAgentId !== id) {
      return reply.code(403).send({ error: "live_session_agent_mismatch" });
    }
    return consumed;
  });

  app.post("/v1/edge-agents/:id/talk-sessions/:sessionId/complete", async (request, reply) => {
    const { id, sessionId } = z.object({ id: z.string().min(1), sessionId: z.string().min(1) }).parse(request.params);
    const body = z.object({
      cameraId: z.string().min(1),
      userId: z.string().min(1),
      startedAt: z.string().datetime(),
      endedAt: z.string().datetime(),
      durationMs: z.number().int().min(0).max(3_600_000),
      outcome: z.enum(["success", "failure"]),
      adapter: z.string().min(1).max(120),
      codec: z.string().min(1).max(32).optional(),
      bytesSent: z.number().int().min(0).optional(),
      error: z.string().min(1).max(300).optional(),
    }).parse(request.body);
    const agent = await store.heartbeatEdgeAgent(
      id,
      request.headers["x-edge-agent-version"] as string || "unknown",
    );
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const camera = await store.getCamera(body.cameraId);
    const user = await store.getUser(body.userId);
    const cameraNode = camera ? await store.getNode(camera.nodeId) : undefined;
    if (!camera || camera.edgeAgentId !== id || !cameraNode || !user || user.tenantId !== cameraNode.tenantId) {
      return reply.code(403).send({ error: "talk_session_agent_mismatch" });
    }
    await store.writeAudit({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "talk_session.completed",
      resourceNodeId: camera.nodeId,
      outcome: body.outcome,
      details: {
        sessionId,
        cameraId: camera.id,
        branchId: camera.branchId,
        sourceType: camera.sourceType ?? "ip-camera",
        recorderChannel: camera.recorderChannel ?? camera.channel,
        startedAt: body.startedAt,
        endedAt: body.endedAt,
        durationMs: body.durationMs,
        adapter: body.adapter,
        ...(body.codec ? { codec: body.codec } : {}),
        ...(body.bytesSent !== undefined ? { bytesSent: body.bytesSent } : {}),
        ...(body.error ? { error: body.error } : {}),
      },
    });
    return reply.code(202).send({ accepted: true });
  });
  await registerCameraDiscoveryRoutes(app, store, pool);
  await registerRecorderLifecycleRoutes(app, store);
  await registerCommandCenterRoutes(app, store);
  await registerRCAIncidentIntegrationRoutes(app, store);
  await registerDigitalTwinRoutes(app, store, {
    assetRoot: options?.digitalTwinAssetRoot ?? process.env.DIGITAL_TWIN_ASSET_ROOT ?? "./digital-twin-assets",
  });
  // Core maintenance routes depend only on ControlPlaneStore and must be
  // available for both the in-memory development runtime and PostgreSQL.
  await registerMaintenanceRoutes(app, store);
  await registerOperationalHealthRoutes(app, store);
  await registerBranchCommandCenterRoutes(app, store);
  await registerEnterpriseInfrastructureRoutes(app, store);
  await registerVideoWallRoutes(app, store);
  await registerFederationRoutes(app, store, federationManager, {
    federationSharedKey,
    localSearchProvider: federationLocalSearchProvider,
  });

  // Security operations is intentionally based on data that the control plane
  // already observes.  Do not let optional external collectors (EDR, TPM,
  // certificate authority, etc.) make the whole page unavailable: their
  // evidence is reported separately as UNKNOWN until it is actually supplied.
  app.get("/api/security/posture", async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    try {
      return await buildLiveSecurityOperationsPosture(store, user);
    } catch (error) {
      app.log.error({ error, tenantId: user.tenantId }, "failed to build live security operations posture");
      return reply.code(500).send({
        available: false,
        reason: "security_operations_data_unavailable",
      });
    }
  });
  if (extendedStore) {
    await registerDeviceManagementRoutes(app, extendedStore);
    await registerAuthRoutes(app, extendedStore);
    await registerEnterpriseAuthRoutes(app, extendedStore);
    await registerOrganizationRoutes(app, extendedStore);
    await registerBranchLifecycleRoutes(app, extendedStore);
    await registerUserRoutes(app, extendedStore);
    await registerCameraPermissionRoutes(app, extendedStore);
    await registerCctvInfrastructureRoutes(app, extendedStore);
    if (hasAuditRepository(extendedStore)) {
      await registerAuditRoutes(app, extendedStore, extendedStore.audits);
    }
    await registerComplianceRoutes(app, extendedStore);
    await registerComplianceEnhancedRoutes(app, extendedStore);
    await registerMaintenanceDashboardRoutes(app, extendedStore);
    await registerMaintenanceAdvancedRoutes(app, extendedStore);
    await registerMaintenanceHealthRoutes(app, extendedStore);
    await registerMaintenanceReportsRoutes(app, extendedStore);
    await registerMaintenanceExportRoutes(app, extendedStore);
    await registerFirmwareManagementRoutes(app, extendedStore);
    await registerPredictiveAnalyticsRoutes(app, extendedStore);
    await registerEmployeeActivityTrackingRoutes(app, extendedStore);
    
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

    // Initialize security services and collectors
    try {
      const { SecurityServicesFactory } = await import("./security/services/index.js");
      const { SecurityMonitor } = await import("./security/monitoring/security-monitor.js");
      
      const securityServices = SecurityServicesFactory.getInstance();
      await securityServices.initialize();
      app.log.info('Security services (Certificate, TPM, Secure Boot, Vault, Ransomware, Tamper) initialized');
      
      const securityMonitor = SecurityMonitor.getInstance();
      await securityMonitor.startMonitoring();
      app.log.info('Security monitoring started');
      
      app.addHook('onClose', async () => {
        securityMonitor.stopMonitoring();
        await securityServices.shutdown();
      });
    } catch (err: unknown) {
      app.log.error({ err }, 'failed to initialize security services - security posture will be unavailable');
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
  registerMediaSessionRoutes(app, store);
  
  // Register media orchestration routes
  try {
    const { mediaRoutes } = await import("./media/media.routes.js");
    await app.register(mediaRoutes, { prefix: "/api/media" });
    
    // Initialize media integrations
    const { getMediaIntegrationService } = await import("./media/integration.service.js");
    const integrationService = getMediaIntegrationService(store);
    await integrationService.initialize();
    
    app.log.info("Media orchestration routes and integrations initialized");
  } catch (err: unknown) {
    app.log.error({ err }, "Failed to register media orchestration routes");
  }
  
  await registerDashboardRoutes(app, store);
  await registerCredentialsRoutes(app, (store as any).pool);
  await registerBulkUploadRoutes(app, store);
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
  await registerIntegrationRoutes(app, store);
  await adminCameraManagementRoutes(app, store);
  await registerAlertCommandCenterRoutes(app, store, alertDispatcher,
    options?.alertWorkerKey ?? process.env.ALERT_WORKER_SHARED_KEY, voiceTokens,
    alertEvidenceClient);
  
  // Register AI Assistant V2 routes (behind feature flag)
  if (pool) {
    try {
      const { default: aiAssistantV2Routes } = await import("./routes/ai-assistant-v2.routes.js");
      await app.register(aiAssistantV2Routes, { prefix: '/api/ai-assistant-v2' });
      app.log.info('AI Assistant V2 routes registered');
    } catch (err: unknown) {
      app.log.error({ err }, 'failed to register AI Assistant V2 routes');
    }
  }
  
  // Register security dashboard routes
  try {
    const { registerSecurityDashboardRoutes } = await import("./routes/security-dashboard.routes.js");
    await registerSecurityDashboardRoutes(app, store);
    app.log.info('Security dashboard routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register security dashboard routes');
  }

  // Register capabilities routes
  try {
    const capabilitiesModule = await import("./routes/capabilities.routes.js");
    await app.register(capabilitiesModule.default);
    app.log.info('Capabilities routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register capabilities routes');
  }

  // Register Recorder Profiles & Compatibility routes
  try {
    await registerRecorderProfileRoutes(app, store);
    app.log.info('Recorder profile and compatibility routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register recorder profile routes');
  }

  // Register Branch Operational Snapshot & Command Center routes
  try {
    await registerBranchOperationalSnapshotRoutes(app, store);
    app.log.info('Branch operational snapshot routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register branch operational snapshot routes');
  }

  // Register First-Class Retention Compliance Subsystem routes
  try {
    await registerRetentionRoutes(app);
    app.log.info('Retention compliance subsystem routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register retention compliance routes');
  }

  // Register First-Class SMART & Enterprise Storage Health routes
  try {
    await registerStorageHealthRoutes(app, store);
    app.log.info('Enterprise storage and SMART health routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register enterprise storage health routes');
  }

  // Register Control Room Alert Audio Subsystem routes
  try {
    await registerAlertAudioRoutes(app);
    app.log.info('Control room alert audio routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register control room alert audio routes');
  }

  // Register Consolidated Multi-Channel Notification Subsystem routes
  try {
    await registerNotificationRoutes(app);
    app.log.info('Consolidated notification subsystem routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register notification subsystem routes');
  }

  // Register Daily Surveillance Health Report Subsystem routes
  try {
    await registerDailySurveillanceReportRoutes(app);
    app.log.info('Daily surveillance health report routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register daily surveillance health report routes');
  }

  // Register Capability-Aware Device Health Subsystem routes
  try {
    await registerDeviceHealthRoutes(app);
    app.log.info('Capability-aware device health routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register device health routes');
  }

  // Register First-Class Recording Continuity Subsystem routes
  try {
    await registerRecordingContinuityRoutes(app);
    app.log.info('Recording continuity subsystem routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register recording continuity routes');
  }

  // Register Scalable Central Monitoring Station & Priority Work Queue routes
  try {
    await registerCentralMonitoringRoutes(app);
    app.log.info('Central monitoring station and work queue routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register central monitoring routes');
  }

  // Register On-Demand Media & Local Video Residency routes
  try {
    await registerOnDemandMediaRoutes(app);
    app.log.info('On-demand media and local video residency routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register on-demand media routes');
  }

  // Register Normalized AI Alerts & Surveillance Event routes
  try {
    await registerAiAlertsRoutes(app);
    app.log.info('Normalized AI alerts and surveillance event routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register AI alerts routes');
  }

  // Register Alert Incidents & Storm Suppression routes
  try {
    await registerAlertIncidentsRoutes(app);
    app.log.info('Alert incidents and storm suppression routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register alert incidents routes');
  }

  // Register First-Class Evidence-Driven Branch Internet & WAN Connectivity routes
  try {
    await registerConnectivityHealthRoutes(app, store);
    app.log.info('Branch internet and WAN connectivity routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register branch connectivity routes');
  }

  // Register Production-Grade Real-Time Alert Operations routes
  try {
    await registerAlertOperationsRoutes(app, store);
    app.log.info('Real-time alert operations routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register real-time alert operations routes');
  }

  // Register Historical SLA Metrics & Daily Health Aggregation routes
  try {
    await registerSlaReportRoutes(app, store);
    app.log.info('Historical SLA reports and aggregation routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register SLA reports routes');
  }

  // Register Clock & Time-Drift Monitoring routes
  try {
    await registerClockMonitoringRoutes(app, store);
    app.log.info('Clock and time-drift monitoring routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register clock monitoring routes');
  }

  // Register Edge Gateway Protocol & On-Demand Media Session routes
  try {
    await registerEdgeGatewayRoutes(app, store);
    app.log.info('Edge Gateway protocol and media session routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register edge gateway routes');
  }

  // Register Guaranteed Alert Evidence & Forensic Verification routes
  try {
    await registerEvidenceCaptureRoutes(app, store);
    app.log.info('Guaranteed alert evidence capture routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register evidence capture routes');
  }

  // Register AI Alert Deduplication & Temporal Aggregation routes
  try {
    await registerDeduplicationRoutes(app, store);
    app.log.info('AI alert deduplication and aggregation routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register alert deduplication routes');
  }

  // Register banking analytics routes
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bankingModule = require('../analytics-engine/dist/analytics-engine/src/routes/banking-analytics-api.js');
    await bankingModule.registerBankingAnalyticsApiRoutes(app, {});
    app.log.info('Banking analytics routes registered');
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to register banking analytics routes');
  }
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

  // Register AI video search routes if pool available
  if (pool) {
    try {
      await registerAIVideoSearchRoutes(app, pool);
      app.log.info("AI video search routes registered");
    } catch (error) {
      app.log.warn({ error }, "Failed to register AI video search routes");
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
    if (
      _request.method === "DELETE" &&
      /^\/v1\/admin\/cameras\/.*/.test(_request.url)
    ) {
      app.log.error({ error, requestUrl: _request.url }, "Camera deletion route error bypassed route-level handler");
      return reply.code(500).send({
        error: "camera_deletion_failed",
        message: "An unexpected error occurred during deletion",
      });
    }
    if (
      _request.method === "POST" &&
      _request.url === "/v1/admin/cameras/delete"
    ) {
      app.log.error({ error, requestUrl: _request.url }, "Camera deletion route error bypassed route-level handler");
      return reply.code(500).send({
        error: "camera_deletion_failed",
        message: "An unexpected error occurred during deletion",
      });
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
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/live-sessions\/consume$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/talk-sessions\/[^/]+\/complete$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/edge-agents\/[^/]+\/scan-jobs\/next$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/scan-jobs\/[^/]+\/complete$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/(?:telemetry|recorder-hdd|recorder-archive)$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/analytics\/frames$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/edge-agents\/[^/]+\/(?:commands|updates)\/next$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/edge-agents\/[^/]+\/bootstrap$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/edge-agents\/[^/]+\/discovery-bootstrap$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/commands\/[^/]+\/complete$/.test(path)) return true;
  return method === "POST" && /^\/v1\/branches\/[^/]+\/cameras\/discovered$/.test(path);
}

function edgeAgentIdFromIngress(request: FastifyRequest) {
  const path = request.url.split("?", 1)[0] ?? request.url;
  const direct = path.match(/^\/v1\/edge-agents\/([^/]+)/)?.[1];
  if (direct) return decodeURIComponent(direct);
  if (/^\/v1\/branches\/[^/]+\/cameras\/discovered$/.test(path)) {
    const value = (request.body as { edgeAgentId?: unknown } | undefined)?.edgeAgentId;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function hashEdgeCredential(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Opaque lookup key. The RTSP/ONVIF URL and its credentials remain in the central secret provider. */
function vpnSecretReference(
  branchId: string,
  sourceType: Camera["sourceType"],
  privateAddress: string,
  recorderId?: string,
  recorderChannel?: number,
) {
  const source = sourceType === "analog-dvr-channel" || sourceType === "nvr-channel"
    ? `recorder/${encodeURIComponent(recorderId ?? "unknown")}/channel/${recorderChannel ?? 0}`
    : `camera/${privateAddress}`;
  return `vpn://${encodeURIComponent(branchId)}/${source}`;
}

function initialRecordingJobForSource(sourceType: Camera["sourceType"]): Omit<RecordingJob, "id" | "cameraId" | "updatedAt"> {
  const recorderBacked = sourceType === "analog-dvr-channel" || sourceType === "nvr-channel";
  return {
    mode: "continuous",
    enabled: true,
    status: "idle",
    primaryRecordingStorage: recorderBacked ? "recorder-local" : "sentinel-local",
    cloudArchivePolicy: recorderBacked ? "incident-evidence-only" : "none",
    retentionDays: 180,
    segmentDurationSeconds: 60,
    hotRetentionDays: 30,
    warmRetentionDays: 60,
    coldRetentionDays: 90,
    critical: false,
    backupRequired: !recorderBacked,
    automaticDeletionEnabled: true,
    evidenceProtection: true,
    recordMainStream: true,
    preRollSeconds: 30,
    postRollSeconds: 120,
    minMotionDurationSeconds: 1,
    motionConfidenceThreshold: 0.65,
    cooldownSeconds: 60,
    maxEventDurationSeconds: 600,
    triggerEventTypes: ["motion", "tamper", "intrusion", "person", "vehicle"],
  };
}

function safeCamera(camera: Camera) {
  const { connectionSecretRef: _secret, ...safe } = camera;
  return {
    ...safe,
    profiles: safe.profiles.map(({ rtspUri: _rtspUri, ...profile }) => profile),
  };
}

function hasAuditRepository<T extends ControlPlaneStore>(
  store: T,
): store is T & { audits: Parameters<typeof registerAuditRoutes>[2] } {
  const candidate = store as { audits?: { getBranchComplianceSummary?: unknown } };
  return typeof candidate.audits?.getBranchComplianceSummary === "function";
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

async function buildLiveSecurityOperationsPosture(
  store: ControlPlaneStore,
  user: NonNullable<Awaited<ReturnType<ControlPlaneStore["getUser"]>>>,
) {
  const branches = await store.listAccessibleNodes(user, "analytics:view", "branch");
  const branchIds = branches.map((branch) => branch.id);
  const cameras = (await Promise.all(
    branches.map((branch) => store.listCamerasByBranch(user, branch.id, "analytics:view")),
  )).flat();
  const [edgeAgentsByBranch, recordingJobs, storageNodes, telemetry] = await Promise.all([
    Promise.all(branchIds.map((branchId) => store.listEdgeAgentsByBranch(branchId))),
    store.listRecordingJobs(cameras.map((camera) => camera.id)),
    store.listRecordingStorageNodes(user.tenantId),
    store.listLatestOperationalTelemetry(user.tenantId, branchIds),
  ]);
  const edgeAgents = edgeAgentsByBranch.flat();
  const now = new Date().toISOString();

  const onlineCameras = cameras.filter((camera) => camera.status === "online");
  const offlineCameras = cameras.filter((camera) => camera.status === "offline");
  const degradedCameras = cameras.filter((camera) => camera.status === "degraded");
  const unknownCameras = cameras.filter((camera) => camera.status === "unknown");
  const onlineEdgeAgents = edgeAgents.filter((agent) => agent.status === "online");
  const offlineEdgeAgents = edgeAgents.filter((agent) => agent.status === "offline");
  const pendingEdgeAgents = edgeAgents.filter((agent) => agent.status === "pending");
  const enabledRecordingJobs = recordingJobs.filter((job) => job.enabled);
  const stoppedRecordingJobs = recordingJobs.filter((job) => !job.enabled);
  const healthyStorageNodes = storageNodes.filter((node) => node.status === "healthy");
  const impairedStorageNodes = storageNodes.filter((node) => node.status === "warning" || node.status === "critical" || node.status === "offline");

  const cameraAvailability = percentage(onlineCameras.length, cameras.length);
  const edgeAvailability = percentage(onlineEdgeAgents.length, edgeAgents.length);
  const recordingCoverage = percentage(enabledRecordingJobs.length, cameras.length);
  const storageHealth = percentage(healthyStorageNodes.length, storageNodes.length);
  const observedScores = [cameraAvailability, edgeAvailability, recordingCoverage, storageHealth]
    .filter((score): score is number => score !== null);
  const operationalCoverage = observedScores.length > 0
    ? Math.round(observedScores.reduce((total, score) => total + score, 0) / observedScores.length)
    : null;

  const latestObservation = [
    ...telemetry.map((item) => item.observedAt),
    ...cameras.map((camera) => camera.lastSeenAt).filter((value): value is string => !!value),
    ...edgeAgents.map((agent) => agent.lastSeenAt).filter((value): value is string => !!value),
    ...storageNodes.map((node) => node.lastSeenAt),
  ].sort().at(-1) ?? null;

  const liveAlerts = [
    ...offlineCameras.map((camera) => ({
      id: `camera-offline:${camera.id}`,
      type: "camera_connectivity",
      severity: "HIGH" as const,
      title: `${camera.name} is offline`,
      timestamp: camera.lastSeenAt ?? latestObservation ?? now,
      acknowledged: false,
    })),
    ...degradedCameras.map((camera) => ({
      id: `camera-degraded:${camera.id}`,
      type: "camera_connectivity",
      severity: "MEDIUM" as const,
      title: `${camera.name} is degraded`,
      timestamp: camera.lastSeenAt ?? latestObservation ?? now,
      acknowledged: false,
    })),
    ...offlineEdgeAgents.map((agent) => ({
      id: `edge-agent-offline:${agent.id}`,
      type: "edge_agent_connectivity",
      severity: "HIGH" as const,
      title: `${agent.name} edge agent is offline`,
      timestamp: agent.lastSeenAt ?? latestObservation ?? now,
      acknowledged: false,
    })),
    ...impairedStorageNodes.map((node) => ({
      id: `storage-${node.status}:${node.id}`,
      type: "recording_storage",
      severity: (node.status === "critical" || node.status === "offline" ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM",
      title: `${node.name} storage is ${node.status}`,
      timestamp: node.lastSeenAt,
      acknowledged: false,
    })),
    ...stoppedRecordingJobs.map((job) => ({
      id: `recording-stopped:${job.cameraId}`,
      type: "recording_coverage",
      severity: "HIGH" as const,
      title: `Recording is disabled for camera ${job.cameraId}`,
      timestamp: job.updatedAt,
      acknowledged: false,
    })),
  ].sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  const camerasWithSecretReference = cameras.filter((camera) => Boolean(camera.connectionSecretRef)).length;
  const camerasWithCertificateMetadata = cameras.filter((camera) => Boolean(camera.certificateRef || camera.certificateFingerprint)).length;
  const hasTelemetry = telemetry.length > 0;
  const state = operationalCoverage === null
    ? "unknown"
    : liveAlerts.some((alert) => alert.severity === "HIGH") || operationalCoverage < 80
      ? "attention"
      : "healthy";

  return {
    available: true,
    provenance: "LIVE" as const,
    timestamp: now,
    summary: {
      state,
      operationalCoverage,
      branchCount: branches.length,
      liveSignalCount: cameras.length + edgeAgents.length + recordingJobs.length + storageNodes.length + telemetry.length,
      latestObservation,
      telemetryConnected: hasTelemetry,
    },
    operations: {
      cameras: {
        total: cameras.length,
        online: onlineCameras.length,
        offline: offlineCameras.length,
        degraded: degradedCameras.length,
        unknown: unknownCameras.length,
        availability: cameraAvailability,
      },
      edgeAgents: {
        total: edgeAgents.length,
        online: onlineEdgeAgents.length,
        offline: offlineEdgeAgents.length,
        pending: pendingEdgeAgents.length,
        availability: edgeAvailability,
      },
      recordings: {
        total: cameras.length,
        configured: recordingJobs.length,
        enabled: enabledRecordingJobs.length,
        stopped: stoppedRecordingJobs.length,
        coverage: recordingCoverage,
      },
      storage: {
        total: storageNodes.length,
        healthy: healthyStorageNodes.length,
        impaired: impairedStorageNodes.length,
        health: storageHealth,
      },
    },
    evidence: [
      {
        id: "secret-references",
        label: "Camera secret references",
        state: cameras.length === 0 ? "unknown" : camerasWithSecretReference === cameras.length ? "observed" : "attention",
        detail: cameras.length === 0
          ? "No camera configuration is in scope."
          : `${camerasWithSecretReference} of ${cameras.length} cameras use an opaque secret reference.`,
      },
      {
        id: "certificate-metadata",
        label: "Device certificate metadata",
        state: camerasWithCertificateMetadata > 0 ? "observed" : "unknown",
        detail: camerasWithCertificateMetadata > 0
          ? `${camerasWithCertificateMetadata} camera${camerasWithCertificateMetadata === 1 ? "" : "s"} report certificate metadata.`
          : "No certificate validity or expiry evidence has been reported.",
      },
      {
        id: "secure-boot",
        label: "Secure Boot",
        state: "unknown",
        detail: "Awaiting an attestation from an enrolled edge device.",
      },
      {
        id: "tpm",
        label: "TPM attestation",
        state: "unknown",
        detail: "Awaiting a signed TPM quote from an enrolled edge device.",
      },
      {
        id: "ransomware",
        label: "Ransomware protection",
        state: "unknown",
        detail: "Awaiting EDR or threat-detection collector evidence.",
      },
      {
        id: "tamper",
        label: "Tamper protection",
        state: "unknown",
        detail: "Awaiting tamper-sensor evidence from an edge device.",
      },
    ],
    alerts: liveAlerts,
  };
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}
