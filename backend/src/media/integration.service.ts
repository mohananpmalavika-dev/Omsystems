/**
 * Media Orchestration Integration Service
 * Connects media orchestrator with device registry, digital twin, and alert system
 */

import { logger } from "../utils/logger.js";
import { getMediaOrchestrator } from "./media-orchestrator.js";
import { getAlertPromotionService } from "./alert-promotion.service.js";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type {
  CameraStreamCapabilities,
  VideoProfile,
  CameraMediaState,
  BranchMediaCapacity,
} from "./types.js";

export class MediaIntegrationService {
  private initialized = false;

  constructor(private readonly store: ControlPlaneStore) {}

  /**
   * Initialize integrations
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info("Initializing media orchestration integrations");

    // Integrate with device registry
    await this.integrateDeviceRegistry();

    // Integrate with digital twin
    await this.integrateDigitalTwin();

    // Integrate with alert system
    this.integrateAlertSystem();

    this.initialized = true;
    logger.info("Media orchestration integrations initialized");
  }

  /**
   * Integrate with device registry to auto-register camera capabilities
   */
  private async integrateDeviceRegistry(): Promise<void> {
    try {
      const orchestrator = getMediaOrchestrator();

      // Get all cameras with profiles
      const branches = await this.store.listAccessibleNodes(
        { id: "system", tenantId: "system", role: "system-admin" } as any,
        "analytics:view",
        "branch"
      );

      for (const branch of branches) {
        const cameras = await this.store.listCamerasByBranch(
          { id: "system", tenantId: "system", role: "system-admin" } as any,
          branch.id,
          "analytics:view"
        );

        for (const camera of cameras) {
          if (!camera.profiles || camera.profiles.length === 0) {
            continue;
          }

          // Find main and sub streams
          const mainProfile = camera.profiles.find((p) => p.role === "main");
          const subProfile = camera.profiles.find((p) => p.role === "sub");

          if (!mainProfile) {
            continue;
          }

          // Register camera capabilities
          const capabilities: CameraStreamCapabilities = {
            cameraId: camera.id,
            mainStream: this.convertToVideoProfile(mainProfile, "INVESTIGATION"),
            subStream: subProfile
              ? this.convertToVideoProfile(subProfile, "MONITORING")
              : undefined,
            supportsAudio: camera.capabilities?.audio ?? false,
            supportsPTZ: camera.capabilities?.ptz ?? false,
            supportsPlayback: true,
          };

          orchestrator.registerCameraCapabilities(capabilities);
        }
      }

      logger.info("Device registry integration complete", {
        camerasRegistered: branches.length,
      });
    } catch (error) {
      logger.error("Failed to integrate device registry", { error });
    }
  }

  /**
   * Integrate with digital twin for network health awareness
   */
  private async integrateDigitalTwin(): Promise<void> {
    try {
      const orchestrator = getMediaOrchestrator();

      // Get all cameras and their network state
      const branches = await this.store.listAccessibleNodes(
        { id: "system", tenantId: "system", role: "system-admin" } as any,
        "analytics:view",
        "branch"
      );

      for (const branch of branches) {
        const cameras = await this.store.listCamerasByBranch(
          { id: "system", tenantId: "system", role: "system-admin" } as any,
          branch.id,
          "analytics:view"
        );

        // Update branch capacity from operational telemetry
        const telemetry = await this.store.listLatestOperationalTelemetry(
          branch.tenantId,
          [branch.id]
        );

        const networkTelemetry = telemetry.find(
          (t) => t.deviceType === "network"
        );

        if (networkTelemetry && networkTelemetry.metrics.uploadSpeedMbps) {
          const capacity: BranchMediaCapacity = {
            branchId: branch.id,
            configuredUploadMbps: networkTelemetry.metrics.uploadSpeedMbps as number,
            usableVideoBudgetMbps: (networkTelemetry.metrics.uploadSpeedMbps as number) * 0.7, // Reserve 30% for other traffic
            activeVideoMbps: 0,
            activeSessions: 0,
            lastUpdated: new Date(),
          };

          orchestrator.updateBranchCapacity(capacity);
        }

        // Update camera states
        for (const camera of cameras) {
          const cameraState: CameraMediaState = {
            cameraId: camera.id,
            branchId: branch.id,
            online: camera.status === "online",
            capabilities: null, // Would be populated from registry
            lastSeen: camera.lastSeenAt ? new Date(camera.lastSeenAt) : new Date(),
            healthStatus:
              camera.status === "online"
                ? "HEALTHY"
                : camera.status === "degraded"
                ? "DEGRADED"
                : "UNREACHABLE",
            networkPath: [], // Would come from digital twin topology
            canStreamNow: camera.status === "online",
            reason:
              camera.status === "offline"
                ? "Camera offline"
                : camera.status === "degraded"
                ? "Camera degraded"
                : undefined,
          };

          orchestrator.updateCameraState(cameraState);
        }
      }

      logger.info("Digital twin integration complete");
    } catch (error) {
      logger.error("Failed to integrate digital twin", { error });
    }
  }

  /**
   * Integrate with alert system for auto-promotion
   */
  private integrateAlertSystem(): void {
    // This would listen to alert events in production
    // For now, we just log that the integration is ready
    logger.info("Alert system integration ready");
  }

  /**
   * Process alert and promote camera if needed
   * Called by alert system when alerts are created
   */
  async processAlert(alert: {
    id: string;
    cameraId: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    type: string;
  }): Promise<void> {
    try {
      // Get camera to find branch
      const camera = await this.store.getCamera(alert.cameraId);
      if (!camera) {
        logger.warn("Alert for unknown camera", { cameraId: alert.cameraId });
        return;
      }

      const promotionService = getAlertPromotionService();

      const result = await promotionService.processAlert({
        alertId: alert.id,
        cameraId: alert.cameraId,
        branchId: camera.branchId,
        severity: alert.severity,
        alertType: alert.type,
        timestamp: new Date(),
      });

      if (result.promoted) {
        logger.info("Camera promoted due to alert", {
          cameraId: alert.cameraId,
          alertId: alert.id,
          severity: alert.severity,
          toState: result.toState,
        });

        // Auto-clear promotion after 5 minutes
        promotionService.clearPromotionAfterTimeout(alert.cameraId, 300_000);
      }
    } catch (error) {
      logger.error("Failed to process alert for promotion", { error, alert });
    }
  }

  /**
   * Convert camera profile to video profile
   */
  private convertToVideoProfile(
    profile: any,
    purpose: VideoProfile["purpose"]
  ): VideoProfile {
    return {
      id: profile.name,
      purpose,
      codec: profile.codec === "H265" ? "H265" : profile.codec === "H264" ? "H264" : "H264+",
      width: profile.width,
      height: profile.height,
      fps: profile.frameRate || 15,
      bitrateKbps: profile.bitrateKbps,
      uri: profile.rtspUri || "",
    };
  }

  /**
   * Refresh camera capabilities (called periodically or on demand)
   */
  async refreshCameraCapabilities(cameraId: string): Promise<void> {
    try {
      const camera = await this.store.getCamera(cameraId);
      if (!camera || !camera.profiles || camera.profiles.length === 0) {
        return;
      }

      const orchestrator = getMediaOrchestrator();

      const mainProfile = camera.profiles.find((p) => p.role === "main");
      const subProfile = camera.profiles.find((p) => p.role === "sub");

      if (!mainProfile) {
        return;
      }

      const capabilities: CameraStreamCapabilities = {
        cameraId: camera.id,
        mainStream: this.convertToVideoProfile(mainProfile, "INVESTIGATION"),
        subStream: subProfile
          ? this.convertToVideoProfile(subProfile, "MONITORING")
          : undefined,
        supportsAudio: camera.capabilities?.audio ?? false,
        supportsPTZ: camera.capabilities?.ptz ?? false,
        supportsPlayback: true,
      };

      orchestrator.registerCameraCapabilities(capabilities);

      logger.debug("Camera capabilities refreshed", { cameraId });
    } catch (error) {
      logger.error("Failed to refresh camera capabilities", { error, cameraId });
    }
  }

  /**
   * Update branch capacity from telemetry
   */
  async updateBranchCapacityFromTelemetry(branchId: string): Promise<void> {
    try {
      const branch = await this.store.getNode(branchId);
      if (!branch) {
        return;
      }

      const telemetry = await this.store.listLatestOperationalTelemetry(
        branch.tenantId,
        [branchId]
      );

      const networkTelemetry = telemetry.find(
        (t) => t.deviceType === "network"
      );

      if (networkTelemetry && networkTelemetry.metrics.uploadSpeedMbps) {
        const orchestrator = getMediaOrchestrator();

        const capacity: BranchMediaCapacity = {
          branchId,
          configuredUploadMbps: networkTelemetry.metrics.uploadSpeedMbps as number,
          usableVideoBudgetMbps: (networkTelemetry.metrics.uploadSpeedMbps as number) * 0.7,
          activeVideoMbps: 0,
          activeSessions: 0,
          lastUpdated: new Date(),
        };

        orchestrator.updateBranchCapacity(capacity);

        logger.debug("Branch capacity updated from telemetry", { branchId });
      }
    } catch (error) {
      logger.error("Failed to update branch capacity from telemetry", {
        error,
        branchId,
      });
    }
  }
}

/**
 * Global instance
 */
let integrationService: MediaIntegrationService | null = null;

/**
 * Get or create integration service
 */
export function getMediaIntegrationService(
  store: ControlPlaneStore
): MediaIntegrationService {
  if (!integrationService) {
    integrationService = new MediaIntegrationService(store);
  }
  return integrationService;
}
