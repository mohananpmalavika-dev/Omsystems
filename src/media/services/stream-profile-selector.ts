/**
 * Adaptive Stream Profile Selector
 * 
 * Determines whether to serve Main Stream (1080p) or Substream (360p)
 * based on operator use-case, network connection type (Primary vs LTE Failover), and edge load.
 */

import type { StreamQuality, SessionPurpose, BranchNetworkState, EdgeGatewayCapacity } from "../domain/media-session.types.js";

export interface StreamContext {
  requestedQuality?: StreamQuality | undefined;
  purpose: SessionPurpose;
  network?: BranchNetworkState | undefined;
  gateway?: EdgeGatewayCapacity | undefined;
}

export class StreamProfileSelector {
  private static globalAdminPreference: StreamQuality = 
    (process.env.ADMIN_STREAM_PREFERENCE as StreamQuality) || "AUTO";

  /**
   * Configure global admin stream quality preference
   */
  static setGlobalAdminPreference(preference: StreamQuality): void {
    StreamProfileSelector.globalAdminPreference = preference;
  }

  /**
   * Get current global admin stream quality preference
   */
  static getGlobalAdminPreference(): StreamQuality {
    return StreamProfileSelector.globalAdminPreference;
  }

  static select(context: StreamContext): { resolvedQuality: "SUBSTREAM" | "MAINSTREAM"; mediaMode: "DIRECT" | "REMUX" | "TRANSCODE" } {
    // 0. Effective requested quality incorporating Admin Global Preference
    const effectiveQuality = context.requestedQuality && context.requestedQuality !== "AUTO"
      ? context.requestedQuality
      : StreamProfileSelector.globalAdminPreference;

    // 1. If Admin or Client explicitly requested MAINSTREAM
    if (effectiveQuality === "MAINSTREAM") {
      // Check if network is in extreme LTE failover with less than 0.5 Mbps upload
      if (context.network?.mode === "FAILOVER" && context.network.uploadMbps < 0.5) {
        return { resolvedQuality: "SUBSTREAM", mediaMode: "REMUX" };
      }
      return { resolvedQuality: "MAINSTREAM", mediaMode: "REMUX" };
    }


    if (effectiveQuality === "SUBSTREAM") {
      return { resolvedQuality: "SUBSTREAM", mediaMode: "REMUX" };
    }

    // 2. AUTO resolution based on purpose & network state
    if (context.purpose === "VIDEO_WALL" || context.purpose === "LIVE_VIEW") {
      // Multi-camera grid default to substream to conserve decoder and bandwidth
      return { resolvedQuality: "SUBSTREAM", mediaMode: "REMUX" };
    }

    if (context.purpose === "INCIDENT" || context.purpose === "INVESTIGATION" || context.purpose === "ALERT") {
      if (context.network?.mode !== "FAILOVER") {
        return { resolvedQuality: "MAINSTREAM", mediaMode: "REMUX" };
      }
    }

    return { resolvedQuality: "SUBSTREAM", mediaMode: "REMUX" };
  }
}

