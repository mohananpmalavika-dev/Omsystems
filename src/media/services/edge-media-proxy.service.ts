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

export class EdgeMediaProxyService {
  private activeStreams: Map<string, SharedStream> = new Map(); // key: `${cameraId}:${quality}`

  async acquireStream(
    cameraId: string,
    quality: "SUBSTREAM" | "MAINSTREAM",
    sessionId: string
  ): Promise<{ streamUrl: string; isNewUpstreamSource: boolean; activeSubscribers: number }> {
    const key = `${cameraId}:${quality}`;
    let shared = this.activeStreams.get(key);
    let isNewUpstreamSource = false;

    if (!shared) {
      // Open local upstream RTSP connection to NVR (Edge resolves credentials locally)
      isNewUpstreamSource = true;
      shared = {
        cameraId,
        quality,
        rtspSourceUri: `rtsp://edge-local-vault@192.168.10.44:554/cam/realmonitor?channel=1&subtype=${quality === "SUBSTREAM" ? 1 : 0}`,
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

    // Return ephemeral WebRTC transport URL
    const streamUrl = `wss://edge-gw-178.local/webrtc/live?session=${sessionId}&cam=${cameraId}&q=${quality.toLowerCase()}`;
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
  }
}

export const edgeMediaProxyService = new EdgeMediaProxyService();
