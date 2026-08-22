/**
 * Media Policy Service
 * Enforces bandwidth policies, branch capacity limits, and quality decisions
 */

import { logger } from "../utils/logger.js";
import type {
  MediaPolicyDecision,
  BranchMediaCapacity,
  VideoProfile,
  StreamPurpose,
  MonitoringProfile,
  MediaDegradationLevel,
} from "./types.js";

export interface MediaPolicyServiceOptions {
  defaultBranchUploadMbps?: number;
  platformMaxBandwidthMbps?: number;
}

export class MediaPolicyService {
  private branchCapacities: Map<string, BranchMediaCapacity> = new Map();
  private monitoringProfiles: Map<string, MonitoringProfile> = new Map();
  private readonly platformMaxBandwidthMbps: number;

  constructor(options: MediaPolicyServiceOptions = {}) {
    this.platformMaxBandwidthMbps = options.platformMaxBandwidthMbps || 500;
  }

  /**
   * Update branch media capacity
   */
  updateBranchCapacity(capacity: BranchMediaCapacity): void {
    this.branchCapacities.set(capacity.branchId, capacity);
    logger.debug("Branch capacity updated", {
      branchId: capacity.branchId,
      uploadMbps: capacity.configuredUploadMbps,
      videoB udgetMbps: capacity.usableVideoBudgetMbps,
    });
  }

  /**
   * Get branch capacity
   */
  getBranchCapacity(branchId: string): BranchMediaCapacity | null {
    return this.branchCapacities.get(branchId) || null;
  }

  /**
   * Set monitoring profile for user
   */
  setMonitoringProfile(profile: MonitoringProfile): void {
    this.monitoringProfiles.set(profile.userId, profile);
    logger.debug("Monitoring profile set", {
      userId: profile.userId,
      role: profile.role,
      maxMainStreams: profile.maxMainStreams,
    });
  }

  /**
   * Get monitoring profile for user
   */
  getMonitoringProfile(userId: string): MonitoringProfile | null {
    return this.monitoringProfiles.get(userId) || null;
  }

  /**
   * Evaluate policy for stream request
   */
  evaluatePolicy(request: {
    branchId: string;
    userId: string;
    cameraId: string;
    purpose: StreamPurpose;
    requestedProfile: VideoProfile;
    alternativeProfile?: VideoProfile;
    currentBranchSessions: number;
    currentUserMainStreams: number;
  }): MediaPolicyDecision {
    // Check branch capacity
    const branchCapacity = this.branchCapacities.get(request.branchId);
    if (!branchCapacity) {
      // No capacity data - allow with warning
      logger.warn("No branch capacity data", { branchId: request.branchId });
      return {
        allowed: true,
        reason: "No branch capacity data, allowing by default",
        suggestedProfile: request.requestedProfile,
      };
    }

    // Estimate bandwidth for requested profile
    const estimatedBandwidthMbps = this.estimateProfileBandwidth(request.requestedProfile);

    // Check if branch has available bandwidth
    const availableBandwidth = branchCapacity.usableVideoBudgetMbps - branchCapacity.activeVideoMbps;

    if (estimatedBandwidthMbps > availableBandwidth) {
      // Not enough bandwidth - try alternative profile
      if (request.alternativeProfile) {
        const altBandwidth = this.estimateProfileBandwidth(request.alternativeProfile);
        
        if (altBandwidth <= availableBandwidth) {
          logger.info("Downgrading stream quality due to bandwidth", {
            branchId: request.branchId,
            requested: `${request.requestedProfile.width}x${request.requestedProfile.height}`,
            alternative: `${request.alternativeProfile.width}x${request.alternativeProfile.height}`,
            availableMbps: availableBandwidth.toFixed(2),
          });

          return {
            allowed: true,
            reason: "Downgraded to substream due to bandwidth constraints",
            suggestedProfile: request.alternativeProfile,
            suggestedDegradation: MediaDegradationLevel.SUBSTREAM_ONLY,
            estimatedBandwidthMbps: altBandwidth,
          };
        }
      }

      // No alternative or alternative also exceeds - suggest snapshot
      logger.warn("Branch bandwidth exhausted", {
        branchId: request.branchId,
        availableMbps: availableBandwidth.toFixed(2),
        requestedMbps: estimatedBandwidthMbps.toFixed(2),
      });

      return {
        allowed: false,
        reason: `Branch bandwidth exhausted (${availableBandwidth.toFixed(1)} Mbps available, ${estimatedBandwidthMbps.toFixed(1)} Mbps required)`,
        suggestedDegradation: MediaDegradationLevel.SNAPSHOT_ONLY,
      };
    }

    // Check user monitoring profile limits
    const monitoringProfile = this.monitoringProfiles.get(request.userId);
    if (monitoringProfile) {
      // Check if user exceeded main stream quota
      if (
        request.requestedProfile.purpose === "INVESTIGATION" &&
        request.currentUserMainStreams >= monitoringProfile.maxMainStreams &&
        request.requestedProfile.width > 1280 // Consider > 720p as main stream
      ) {
        // Try to downgrade to substream
        if (request.alternativeProfile) {
          logger.info("User main stream quota reached, downgrading", {
            userId: request.userId,
            currentMainStreams: request.currentUserMainStreams,
            maxMainStreams: monitoringProfile.maxMainStreams,
          });

          return {
            allowed: true,
            reason: "User main stream quota reached, using substream",
            suggestedProfile: request.alternativeProfile,
            suggestedDegradation: MediaDegradationLevel.SUBSTREAM_ONLY,
            estimatedBandwidthMbps: this.estimateProfileBandwidth(request.alternativeProfile),
          };
        }
      }
    }

    // Check platform-wide bandwidth
    const totalPlatformBandwidth = Array.from(this.branchCapacities.values())
      .reduce((sum, cap) => sum + cap.activeVideoMbps, 0);

    if (totalPlatformBandwidth + estimatedBandwidthMbps > this.platformMaxBandwidthMbps) {
      logger.warn("Platform bandwidth limit approaching", {
        totalMbps: totalPlatformBandwidth.toFixed(2),
        maxMbps: this.platformMaxBandwidthMbps,
      });

      // Still allow but suggest degradation for non-critical purposes
      if (request.purpose === "MONITORING" && request.alternativeProfile) {
        return {
          allowed: true,
          reason: "Platform bandwidth high, using substream for monitoring",
          suggestedProfile: request.alternativeProfile,
          suggestedDegradation: MediaDegradationLevel.SUBSTREAM_ONLY,
          estimatedBandwidthMbps: this.estimateProfileBandwidth(request.alternativeProfile),
        };
      }
    }

    // All checks passed
    return {
      allowed: true,
      reason: "Policy checks passed",
      suggestedProfile: request.requestedProfile,
      estimatedBandwidthMbps,
    };
  }

  /**
   * Estimate bandwidth for video profile
   */
  private estimateProfileBandwidth(profile: VideoProfile): number {
    // Use configured bitrate if available
    if (profile.bitrateKbps) {
      return profile.bitrateKbps / 1000; // Convert to Mbps
    }

    // Estimate based on resolution and codec
    const pixels = profile.width * profile.height;
    const fps = profile.fps;

    // Rough estimation formulas
    let bitsPerPixel: number;
    
    if (profile.codec === "H265") {
      // H.265 is ~50% more efficient than H.264
      bitsPerPixel = pixels < 640 * 360 ? 0.08 : pixels < 1920 * 1080 ? 0.05 : 0.03;
    } else {
      bitsPerPixel = pixels < 640 * 360 ? 0.15 : pixels < 1920 * 1080 ? 0.10 : 0.06;
    }

    const estimatedKbps = (pixels * fps * bitsPerPixel) / 1000;
    return estimatedKbps / 1000; // Convert to Mbps
  }

  /**
   * Reserve bandwidth for session
   */
  reserveBandwidth(
    branchId: string,
    estimatedMbps: number
  ): boolean {
    const capacity = this.branchCapacities.get(branchId);
    if (!capacity) {
      logger.warn("Cannot reserve bandwidth, no capacity data", { branchId });
      return false;
    }

    if (capacity.activeVideoMbps + estimatedMbps > capacity.usableVideoBudgetMbps) {
      return false;
    }

    capacity.activeVideoMbps += estimatedMbps;
    capacity.activeSessions += 1;
    capacity.lastUpdated = new Date();

    logger.debug("Bandwidth reserved", {
      branchId,
      reservedMbps: estimatedMbps.toFixed(2),
      totalMbps: capacity.activeVideoMbps.toFixed(2),
      budgetMbps: capacity.usableVideoBudgetMbps,
    });

    return true;
  }

  /**
   * Release bandwidth reservation
   */
  releaseBandwidth(
    branchId: string,
    estimatedMbps: number
  ): void {
    const capacity = this.branchCapacities.get(branchId);
    if (!capacity) {
      return;
    }

    capacity.activeVideoMbps = Math.max(0, capacity.activeVideoMbps - estimatedMbps);
    capacity.activeSessions = Math.max(0, capacity.activeSessions - 1);
    capacity.lastUpdated = new Date();

    logger.debug("Bandwidth released", {
      branchId,
      releasedMbps: estimatedMbps.toFixed(2),
      remainingMbps: capacity.activeVideoMbps.toFixed(2),
    });
  }

  /**
   * Get default monitoring profile based on role
   */
  getDefaultMonitoringProfile(userId: string, role: string): MonitoringProfile {
    switch (role.toLowerCase()) {
      case "branch_manager":
        return {
          userId,
          role,
          maxGridPositions: 16,
          preferredDecoderBudget: 16,
          maxMainStreams: 4,
          maxBranchBandwidthMbps: 10,
          sequenceIntervalSeconds: 20,
        };

      case "regional_operator":
        return {
          userId,
          role,
          maxGridPositions: 36,
          preferredDecoderBudget: 36,
          maxMainStreams: 8,
          maxBranchBandwidthMbps: 15,
          sequenceIntervalSeconds: 15,
        };

      case "ho_operator":
      case "control_room_operator":
        return {
          userId,
          role,
          maxGridPositions: 64,
          preferredDecoderBudget: 64,
          maxMainStreams: 16,
          maxBranchBandwidthMbps: 20,
          sequenceIntervalSeconds: 15,
        };

      case "video_wall_operator":
      case "admin":
        return {
          userId,
          role,
          maxGridPositions: 144,
          preferredDecoderBudget: 144,
          maxMainStreams: 32,
          maxBranchBandwidthMbps: 25,
          sequenceIntervalSeconds: 10,
        };

      default:
        return {
          userId,
          role,
          maxGridPositions: 9,
          preferredDecoderBudget: 9,
          maxMainStreams: 2,
          maxBranchBandwidthMbps: 5,
          sequenceIntervalSeconds: 30,
        };
    }
  }

  /**
   * Get policy metrics
   */
  getMetrics(): {
    totalBranches: number;
    totalBandwidthMbps: number;
    averageBandwidthPerBranch: number;
    branchesAtCapacity: number;
    branchesNearCapacity: number;
  } {
    const capacities = Array.from(this.branchCapacities.values());
    
    const totalBandwidth = capacities.reduce((sum, cap) => sum + cap.activeVideoMbps, 0);
    const atCapacity = capacities.filter(
      (cap) => cap.activeVideoMbps >= cap.usableVideoBudgetMbps
    ).length;
    const nearCapacity = capacities.filter(
      (cap) =>
        cap.activeVideoMbps >= cap.usableVideoBudgetMbps * 0.8 &&
        cap.activeVideoMbps < cap.usableVideoBudgetMbps
    ).length;

    return {
      totalBranches: capacities.length,
      totalBandwidthMbps: totalBandwidth,
      averageBandwidthPerBranch:
        capacities.length > 0 ? totalBandwidth / capacities.length : 0,
      branchesAtCapacity: atCapacity,
      branchesNearCapacity: nearCapacity,
    };
  }
}
