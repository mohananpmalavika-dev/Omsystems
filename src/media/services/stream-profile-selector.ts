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
  static select(context: StreamContext): { resolvedQuality: "SUBSTREAM" | "MAINSTREAM"; mediaMode: "DIRECT" | "REMUX" | "TRANSCODE" } {
    // 1. If explicit quality requested
    if (context.requestedQuality === "MAINSTREAM") {
      // Check if network or gateway cannot support main stream
      if (context.network?.mode === "FAILOVER" || (context.gateway && context.gateway.cpuPct > 85)) {
        return { resolvedQuality: "SUBSTREAM", mediaMode: "REMUX" };
      }
      return { resolvedQuality: "MAINSTREAM", mediaMode: "REMUX" };
    }

    if (context.requestedQuality === "SUBSTREAM") {
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
