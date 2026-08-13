/**
 * ONVIF Capability Probe
 * 
 * Discovers capabilities through ONVIF protocol introspection.
 */

import type {
  CapabilityProbe,
  CapabilityProbeContext,
  CapabilityObservation,
  DeviceIdentity,
} from "../capability-probe.interface.js";
import { ProbeError } from "../capability-probe.interface.js";
import type { CapabilityKey } from "../capability.types.js";

/**
 * ONVIF capability probe.
 * 
 * This probe uses ONVIF GetCapabilities and GetServices to determine
 * what features the device supports.
 */
export class OnvifCapabilityProbe implements CapabilityProbe {
  readonly id = "onvif";
  readonly priority = 75;

  supports(device: DeviceIdentity): boolean {
    return (
      device.protocol === "onvif-t" ||
      device.protocol === "onvif-s" ||
      !!device.onvifEndpoint
    );
  }

  async probe(context: CapabilityProbeContext): Promise<CapabilityObservation[]> {
    const { device } = context;

    if (!device.onvifEndpoint) {
      throw new ProbeError(
        this.id,
        device.deviceId,
        "No ONVIF endpoint available",
      );
    }

    const observations: CapabilityObservation[] = [];

    try {
      // Get device capabilities
      const capabilities = await this.getCapabilities(device);

      // Extract video capabilities
      if (capabilities.media) {
        observations.push(...this.extractMediaCapabilities(capabilities.media, device));
      }

      // Extract PTZ capabilities
      if (capabilities.ptz) {
        observations.push(...this.extractPtzCapabilities(capabilities.ptz, device));
      }

      // Extract event capabilities
      if (capabilities.events) {
        observations.push(...this.extractEventCapabilities(capabilities.events, device));
      }

      // Extract analytics capabilities
      if (capabilities.analytics) {
        observations.push(
          ...this.extractAnalyticsCapabilities(capabilities.analytics, device),
        );
      }

      // Check ONVIF profile support
      observations.push(...(await this.checkProfileSupport(device)));

      return observations;
    } catch (error) {
      throw new ProbeError(
        this.id,
        device.deviceId,
        "Failed to probe ONVIF capabilities",
        error instanceof Error ? error : undefined,
      );
    }
  }

  async verify(
    context: CapabilityProbeContext,
    capabilityPath: string,
  ): Promise<CapabilityObservation | null> {
    // For ONVIF, verification is the same as discovery
    // We don't actively test capabilities, just query their availability
    const observations = await this.probe(context);
    return observations.find((obs) => obs.capabilityPath === capabilityPath) ?? null;
  }

  // ============ PRIVATE METHODS ============

  private async getCapabilities(device: DeviceIdentity): Promise<any> {
    // TODO: Implement actual ONVIF GetCapabilities call
    // For now, return mock data
    return {
      media: {
        streamingCapabilities: {
          rtspStreaming: true,
          rtp_rtsp_tcp: true,
        },
      },
      ptz: device.vendor?.toLowerCase().includes("ptz")
        ? {
            eFlip: false,
            reverse: false,
          }
        : undefined,
      events: {
        wsSubscriptionPolicySupport: true,
      },
      analytics: undefined,
    };
  }

  private async checkProfileSupport(
    device: DeviceIdentity,
  ): Promise<CapabilityObservation[]> {
    const observations: CapabilityObservation[] = [];

    // Check ONVIF Profile S (Streaming)
    observations.push({
      capabilityPath: "network.onvif.profileS",
      evidence: {
        source: "ONVIF",
        observedAt: new Date(),
        confidence: 0.95,
        verified: false,
        evidenceType: "GetServices/ProfileS",
        reason: "ONVIF Profile S (Streaming) supported",
      },
    });

    // Check ONVIF Profile T (H.265 Streaming)
    if (device.protocol === "onvif-t") {
      observations.push({
        capabilityPath: "network.onvif.profileT",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.95,
          verified: false,
          evidenceType: "GetServices/ProfileT",
          reason: "ONVIF Profile T (H.265) supported",
        },
      });
    }

    return observations;
  }

  private extractMediaCapabilities(
    media: any,
    device: DeviceIdentity,
  ): CapabilityObservation[] {
    const observations: CapabilityObservation[] = [];

    // Live video
    observations.push({
      capabilityPath: "video.liveVideo",
      evidence: {
        source: "ONVIF",
        observedAt: new Date(),
        confidence: 0.99,
        verified: false,
        evidenceType: "GetCapabilities/Media",
        reason: "Media service available",
      },
    });

    // RTSP streaming
    if (media.streamingCapabilities?.rtspStreaming) {
      observations.push({
        capabilityPath: "video.rtsp",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.99,
          verified: false,
          evidenceType: "GetCapabilities/Media/StreamingCapabilities",
          reason: "RTSP streaming advertised",
        },
      });

      observations.push({
        capabilityPath: "network.rtsp",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.99,
          verified: false,
          evidenceType: "GetCapabilities/Media/StreamingCapabilities",
          reason: "RTSP protocol supported",
        },
      });
    }

    // Snapshots
    observations.push({
      capabilityPath: "video.snapshots",
      evidence: {
        source: "ONVIF",
        observedAt: new Date(),
        confidence: 0.95,
        verified: false,
        evidenceType: "GetCapabilities/Media",
        reason: "Snapshot capability inferred from media service",
      },
    });

    return observations;
  }

  private extractPtzCapabilities(ptz: any, device: DeviceIdentity): CapabilityObservation[] {
    const observations: CapabilityObservation[] = [];

    // PTZ service exists
    observations.push({
      capabilityPath: "ptz.ptz",
      evidence: {
        source: "ONVIF",
        observedAt: new Date(),
        confidence: 0.99,
        verified: false,
        evidenceType: "GetCapabilities/PTZ",
        reason: "PTZ service available",
      },
    });

    // Individual PTZ capabilities
    observations.push(
      {
        capabilityPath: "ptz.pan",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.95,
          verified: false,
          evidenceType: "GetCapabilities/PTZ",
          reason: "Pan capability inferred from PTZ service",
        },
      },
      {
        capabilityPath: "ptz.tilt",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.95,
          verified: false,
          evidenceType: "GetCapabilities/PTZ",
          reason: "Tilt capability inferred from PTZ service",
        },
      },
      {
        capabilityPath: "ptz.zoom",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.95,
          verified: false,
          evidenceType: "GetCapabilities/PTZ",
          reason: "Zoom capability inferred from PTZ service",
        },
      },
      {
        capabilityPath: "ptz.absoluteMove",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.9,
          verified: false,
          evidenceType: "GetCapabilities/PTZ",
        },
      },
      {
        capabilityPath: "ptz.continuousMove",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.9,
          verified: false,
          evidenceType: "GetCapabilities/PTZ",
        },
      },
      {
        capabilityPath: "ptz.presets",
        evidence: {
          source: "ONVIF",
          observedAt: new Date(),
          confidence: 0.85,
          verified: false,
          evidenceType: "GetCapabilities/PTZ",
          reason: "Preset support inferred from PTZ service",
        },
      },
    );

    return observations;
  }

  private extractEventCapabilities(
    events: any,
    device: DeviceIdentity,
  ): CapabilityObservation[] {
    const observations: CapabilityObservation[] = [];

    observations.push({
      capabilityPath: "events.events",
      evidence: {
        source: "ONVIF",
        observedAt: new Date(),
        confidence: 0.99,
        verified: false,
        evidenceType: "GetCapabilities/Events",
        reason: "Event service available",
      },
    });

    observations.push({
      capabilityPath: "events.motionDetection",
      evidence: {
        source: "ONVIF",
        observedAt: new Date(),
        confidence: 0.8,
        verified: false,
        evidenceType: "GetCapabilities/Events",
        reason: "Motion detection commonly available via ONVIF events",
      },
    });

    return observations;
  }

  private extractAnalyticsCapabilities(
    analytics: any,
    device: DeviceIdentity,
  ): CapabilityObservation[] {
    const observations: CapabilityObservation[] = [];

    observations.push({
      capabilityPath: "analytics.lineCrossing",
      evidence: {
        source: "ONVIF",
        observedAt: new Date(),
        confidence: 0.7,
        verified: false,
        evidenceType: "GetCapabilities/Analytics",
        reason: "Analytics service available",
      },
    });

    observations.push({
      capabilityPath: "analytics.intrusionDetection",
      evidence: {
        source: "ONVIF",
        observedAt: new Date(),
        confidence: 0.7,
        verified: false,
        evidenceType: "GetCapabilities/Analytics",
        reason: "Analytics service available",
      },
    });

    return observations;
  }
}
