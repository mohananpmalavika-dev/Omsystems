/**
 * Edge Media Proxy Service
 * 
 * Manages local RTSP connections at the branch edge, reference counting across concurrent viewers,
 * upstream stream warm grace periods, and WebRTC session generation without exposing NVR passwords to HO.
 */

interface SharedStream {
  cameraId: string;
  quality: "SUBSTREAM" | "MAINSTREAM";
  rtspSourceUri: string;
  subscribers: Set<string>; // sessionIds
  startedAt: Date;
  graceTimer?: NodeJS.Timeout | undefined;
}

interface ConfiguredStream {
  rtspSourceUri: string;
  playbackUrl: string;
}

export class EdgeMediaProxyService {
  private activeStreams: Map<string, SharedStream> = new Map(); // key: `${cameraId}:${quality}`
  private configuredStreams: Map<string, ConfiguredStream> = new Map();

  configureStream(
    cameraId: string,
    quality: "SUBSTREAM" | "MAINSTREAM",
    config: ConfiguredStream,
  ): void {
    if (!config.rtspSourceUri || !config.playbackUrl) {
      throw new Error("edge_media_stream_configuration_incomplete");
    }
    this.configuredStreams.set(`${cameraId}:${quality}`, { ...config });
  }

  async acquireStream(
    cameraId: string,
    quality: "SUBSTREAM" | "MAINSTREAM",
    sessionId: string
  ): Promise<{ streamUrl: string; isNewUpstreamSource: boolean; activeSubscribers: number }> {
    const key = `${cameraId}:${quality}`;
    let shared = this.activeStreams.get(key);
    let isNewUpstreamSource = false;

    if (!shared) {
      const configured = this.configuredStreams.get(key);
      if (!configured) throw new Error(`edge_media_stream_not_configured:${key}`);
      isNewUpstreamSource = true;
      shared = {
        cameraId,
        quality,
        rtspSourceUri: configured.rtspSourceUri,
        subscribers: new Set(),
        startedAt: new Date(),
      };
      this.activeStreams.set(key, shared);
    } else if (shared.graceTimer) {
      // Cancel grace period teardown if a new subscriber joins while stream is still warm
      clearTimeout(shared.graceTimer);
      shared.graceTimer = undefined;
    }

    shared.subscribers.add(sessionId);

    const streamUrl = this.configuredStreams.get(key)!.playbackUrl;
    return {
      streamUrl,
      isNewUpstreamSource,
      activeSubscribers: shared.subscribers.size,
    };
  }

  async releaseStream(
    cameraId: string,
    quality: "SUBSTREAM" | "MAINSTREAM",
    sessionId: string,
    gracePeriodMs = 15000
  ): Promise<{ activeSubscribers: number; willTeardown: boolean }> {
    const key = `${cameraId}:${quality}`;
    const shared = this.activeStreams.get(key);
    if (!shared) return { activeSubscribers: 0, willTeardown: false };

    shared.subscribers.delete(sessionId);

    if (shared.subscribers.size === 0) {
      // Start grace period before tearing down upstream RTSP
      shared.graceTimer = setTimeout(() => {
        this.activeStreams.delete(key);
      }, gracePeriodMs);
      return { activeSubscribers: 0, willTeardown: true };
    }

    return { activeSubscribers: shared.subscribers.size, willTeardown: false };
  }

  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  clear() {
    for (const stream of this.activeStreams.values()) {
      if (stream.graceTimer) clearTimeout(stream.graceTimer);
    }
    this.activeStreams.clear();
    this.configuredStreams.clear();
  }
}

export const edgeMediaProxyService = new EdgeMediaProxyService();
