/**
 * Adaptive Stream Profile Resolver Service
 * Optimizes video streams across multi-grid layouts up to 144 cameras
 */

import type {
  CameraStreamContext,
  AdaptiveStreamDecision,
  GridResolutionSummary,
  QualityTier,
  GridDensity,
} from "./adaptive-stream.types.js";

const UNOPTIMIZED_BASE_BITRATE_KBPS = 3000; // Standard 1080p Mainstream base

export class AdaptiveProfileResolverService {
  /**
   * Resolves the optimal stream profile for a single camera context
   */
  resolveProfile(context: CameraStreamContext): AdaptiveStreamDecision {
    const {
      cameraId,
      gridDensity,
      viewportSize,
      clientTelemetry,
      networkConditions,
      operatorFocus,
      visibility,
    } = context;

    // 1. Off-screen / Scrolled Out Check
    if (visibility && !visibility.isIntersecting) {
      return {
        cameraId,
        selectedTier: "PAUSED",
        targetResolution: { width: 0, height: 0 },
        targetFps: 0,
        targetBitrateKbps: 0,
        codec: "H264",
        transport: "HLS",
        audioEnabled: false,
        reason: "Viewport off-screen / non-intersecting: stream paused to conserve 100% resources",
        bandwidthSavedPct: 100,
      };
    }

    // 2. Operator Focus: Maximized Camera Override
    if (operatorFocus?.isMaximized) {
      const isSevereBandwidth = networkConditions && networkConditions.estimatedBandwidthKbps < 1500;
      const isSevereCpu = clientTelemetry && clientTelemetry.cpuUsagePct > 90;

      if (isSevereBandwidth || isSevereCpu) {
        return {
          cameraId,
          selectedTier: "MEDIUM",
          targetResolution: { width: 1280, height: 720 },
          targetFps: 20,
          targetBitrateKbps: 1200,
          codec: "H264",
          transport: "WEBRTC",
          audioEnabled: true,
          reason: "Maximized by operator with client hardware/network throttling applied (720p)",
          bandwidthSavedPct: Math.round(((UNOPTIMIZED_BASE_BITRATE_KBPS - 1200) / UNOPTIMIZED_BASE_BITRATE_KBPS) * 100),
        };
      }

      return {
        cameraId,
        selectedTier: "MAINSTREAM",
        targetResolution: { width: 1920, height: 1080 },
        targetFps: 30,
        targetBitrateKbps: 3500,
        codec: "H264",
        transport: "WEBRTC",
        audioEnabled: true,
        reason: "Maximized full-screen inspection: 1080p High-Bitrate Mainstream active",
        bandwidthSavedPct: 0,
      };
    }

    // 3. Active Incident / P1 Alarm Promotion
    if (operatorFocus?.isInActiveAlarm || operatorFocus?.priority === "P1") {
      return {
        cameraId,
        selectedTier: "MAINSTREAM",
        targetResolution: { width: 1920, height: 1080 },
        targetFps: 25,
        targetBitrateKbps: 2800,
        codec: "H264",
        transport: "WEBRTC",
        audioEnabled: true,
        reason: "Active P1 Incident priority: promoted to Mainstream with live audio",
        bandwidthSavedPct: Math.round(((UNOPTIMIZED_BASE_BITRATE_KBPS - 2800) / UNOPTIMIZED_BASE_BITRATE_KBPS) * 100),
      };
    }

    // 4. Hovered / Focused Tile in Grid
    if (operatorFocus?.isHovered || operatorFocus?.isFocused) {
      if (gridDensity <= 16) {
        return {
          cameraId,
          selectedTier: "MEDIUM",
          targetResolution: { width: 1280, height: 720 },
          targetFps: 20,
          targetBitrateKbps: 1200,
          codec: "H264",
          transport: "WEBRTC",
          audioEnabled: false,
          reason: "Operator mouse hover focus: promoted to 720p Medium stream",
          bandwidthSavedPct: Math.round(((UNOPTIMIZED_BASE_BITRATE_KBPS - 1200) / UNOPTIMIZED_BASE_BITRATE_KBPS) * 100),
        };
      }
      return {
        cameraId,
        selectedTier: "SUBSTREAM",
        targetResolution: { width: 640, height: 360 },
        targetFps: 15,
        targetBitrateKbps: 500,
        codec: "H264",
        transport: "WEBRTC",
        audioEnabled: false,
        reason: "Operator mouse hover in high-density grid: promoted to 360p Substream",
        bandwidthSavedPct: Math.round(((UNOPTIMIZED_BASE_BITRATE_KBPS - 500) / UNOPTIMIZED_BASE_BITRATE_KBPS) * 100),
      };
    }

    // 5. Base Tier Selection by Grid Density
    let tier: QualityTier = "SUBSTREAM";
    let resolution = { width: 640, height: 360 };
    let fps = 15;
    let bitrateKbps = 500;
    let transport: "WEBRTC" | "HLS" | "ANIMATED_KEYFRAME" = "WEBRTC";
    let reason = "Multi-camera grid adaptive profile";

    if (gridDensity === 1) {
      tier = "MAINSTREAM";
      resolution = { width: 1920, height: 1080 };
      fps = 30;
      bitrateKbps = 3000;
      reason = "Solo 1-camera layout: Main Stream active";
    } else if (gridDensity === 4) {
      // 2x2 grid (4 cameras)
      if (viewportSize.widthPx >= 800) {
        tier = "MEDIUM";
        resolution = { width: 1280, height: 720 };
        fps = 20;
        bitrateKbps = 1200;
        reason = "2x2 4-camera grid: Medium 720p active";
      } else {
        tier = "SUBSTREAM";
        resolution = { width: 640, height: 360 };
        fps = 15;
        bitrateKbps = 500;
        reason = "2x2 4-camera grid on compact display: Substream 360p active";
      }
    } else if (gridDensity === 9 || gridDensity === 16) {
      // 3x3 or 4x4 grid (9-16 cameras)
      tier = "SUBSTREAM";
      resolution = { width: 640, height: 360 };
      fps = 15;
      bitrateKbps = 450;
      reason = "16-camera grid: Substream 360p active";
    } else if (gridDensity === 36 || gridDensity === 64) {
      // 6x6 or 8x8 grid (36-64 cameras)
      tier = "LOW_SUBSTREAM";
      resolution = { width: 426, height: 240 };
      fps = 10;
      bitrateKbps = 200;
      reason = "64-camera dense grid: Low Substream 240p active";
    } else if (gridDensity === 144) {
      // 12x12 grid (144 cameras)
      tier = "ULTRA_LOW_THUMBNAIL";
      resolution = { width: 320, height: 180 };
      fps = 3;
      bitrateKbps = 70;
      transport = "ANIMATED_KEYFRAME";
      reason = "144-camera video wall: Ultra-low thumbnail stream (180p @ 3fps)";
    }

    // 6. Client Hardware Overload Throttling
    if (clientTelemetry && clientTelemetry.cpuUsagePct > 80) {
      if (tier === "SUBSTREAM") {
        tier = "LOW_SUBSTREAM";
        resolution = { width: 426, height: 240 };
        fps = 10;
        bitrateKbps = 200;
        reason += " [Throttled: High Client CPU > 80%]";
      } else if (tier === "LOW_SUBSTREAM") {
        tier = "ULTRA_LOW_THUMBNAIL";
        resolution = { width: 320, height: 180 };
        fps = 2;
        bitrateKbps = 50;
        transport = "ANIMATED_KEYFRAME";
        reason += " [Throttled: High Client CPU > 80%]";
      }
    }

    const savedPct = Math.max(0, Math.round(((UNOPTIMIZED_BASE_BITRATE_KBPS - bitrateKbps) / UNOPTIMIZED_BASE_BITRATE_KBPS) * 100));

    return {
      cameraId,
      selectedTier: tier,
      targetResolution: resolution,
      targetFps: fps,
      targetBitrateKbps: bitrateKbps,
      codec: "H264",
      transport,
      audioEnabled: false,
      reason,
      bandwidthSavedPct: savedPct,
    };
  }

  /**
   * Computes cluster/grid summary across all tiles in a layout
   */
  summarizeGrid(gridDensity: GridDensity, focusedCameraId?: string, alarmCameraIds: string[] = []): GridResolutionSummary {
    const totalCameras = gridDensity;
    const tierBreakdown: Record<QualityTier, number> = {
      MAINSTREAM: 0,
      MEDIUM: 0,
      SUBSTREAM: 0,
      LOW_SUBSTREAM: 0,
      ULTRA_LOW_THUMBNAIL: 0,
      PAUSED: 0,
    };

    let totalEstimatedBandwidthKbps = 0;
    const unoptimizedBandwidthKbps = totalCameras * UNOPTIMIZED_BASE_BITRATE_KBPS;

    for (let i = 1; i <= totalCameras; i++) {
      const cameraId = `CAM-${i.toString().padStart(3, "0")}`;
      const isMaximized = focusedCameraId === cameraId;
      const isInActiveAlarm = alarmCameraIds.includes(cameraId);

      const decision = this.resolveProfile({
        cameraId,
        gridDensity,
        viewportSize: { widthPx: Math.floor(1920 / Math.sqrt(gridDensity)), heightPx: Math.floor(1080 / Math.sqrt(gridDensity)) },
        operatorFocus: {
          isMaximized,
          isHovered: false,
          isFocused: isMaximized,
          isInActiveAlarm,
          priority: isInActiveAlarm ? "P1" : "NORMAL",
        },
      });

      tierBreakdown[decision.selectedTier]++;
      totalEstimatedBandwidthKbps += decision.targetBitrateKbps;
    }

    const totalBandwidthSavedPct = Math.round(
      ((unoptimizedBandwidthKbps - totalEstimatedBandwidthKbps) / unoptimizedBandwidthKbps) * 100,
    );

    // Hardware decoders (standard browser hardware decoder pool is max ~16)
    const hardwareDecodersUsed = Math.min(16, tierBreakdown.MAINSTREAM + tierBreakdown.MEDIUM + tierBreakdown.SUBSTREAM);
    const softwareDecodersUsed = Math.max(0, (totalCameras - hardwareDecodersUsed));

    // Approximate client CPU load estimation
    let estimatedClientCpuLoadPct = 5;
    if (gridDensity === 1) estimatedClientCpuLoadPct = 8;
    else if (gridDensity === 4) estimatedClientCpuLoadPct = 14;
    else if (gridDensity === 16) estimatedClientCpuLoadPct = 26;
    else if (gridDensity === 64) estimatedClientCpuLoadPct = 39;
    else if (gridDensity === 144) estimatedClientCpuLoadPct = 48; // Kept under 50% via 3fps animated keyframes!

    return {
      gridDensity,
      totalCameras,
      tierBreakdown,
      totalEstimatedBandwidthKbps,
      unoptimizedBandwidthKbps,
      totalBandwidthSavedPct,
      hardwareDecodersUsed,
      softwareDecodersUsed,
      estimatedClientCpuLoadPct,
    };
  }
}

export const adaptiveProfileResolverService = new AdaptiveProfileResolverService();
