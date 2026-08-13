/**
 * Model Database Capability Probe
 * 
 * Provides declared capabilities based on device model specifications.
 */

import type {
  CapabilityProbe,
  CapabilityProbeContext,
  CapabilityObservation,
  DeviceIdentity,
} from "../capability-probe.interface.js";
import { ProbeError } from "../capability-probe.interface.js";

/**
 * Model specifications database.
 */
interface ModelSpec {
  vendor: string;
  modelPattern: RegExp;
  capabilities: Array<{
    path: string;
    confidence: number;
    reason: string;
    value?: any;
  }>;
}

const MODEL_SPECS: ModelSpec[] = [
  // Hikvision IP Cameras
  {
    vendor: "hikvision",
    modelPattern: /DS-2CD\d+/i,
    capabilities: [
      { path: "video.liveVideo", confidence: 1.0, reason: "Standard IP camera" },
      { path: "video.rtsp", confidence: 1.0, reason: "Hikvision supports RTSP" },
      { path: "video.codecs.h264", confidence: 1.0, reason: "H.264 standard" },
      { path: "video.codecs.h265", confidence: 0.9, reason: "H.265 common in modern models" },
      { path: "recording.recording", confidence: 0.8, reason: "May support SD card recording" },
      { path: "network.onvif.profileS", confidence: 0.95, reason: "ONVIF Profile S standard" },
      { path: "network.https", confidence: 1.0, reason: "HTTPS supported" },
      { path: "events.motionDetection", confidence: 1.0, reason: "Built-in motion detection" },
      { path: "management.firmwareUpgrade", confidence: 1.0, reason: "Remote upgrade supported" },
    ],
  },
  // Hikvision PTZ Cameras
  {
    vendor: "hikvision",
    modelPattern: /DS-2DE\d+/i,
    capabilities: [
      { path: "video.liveVideo", confidence: 1.0, reason: "Standard IP camera" },
      { path: "video.rtsp", confidence: 1.0, reason: "Hikvision supports RTSP" },
      { path: "ptz.ptz", confidence: 1.0, reason: "PTZ model" },
      { path: "ptz.pan", confidence: 1.0, reason: "PTZ model" },
      { path: "ptz.tilt", confidence: 1.0, reason: "PTZ model" },
      { path: "ptz.zoom", confidence: 1.0, reason: "PTZ model" },
      { path: "ptz.presets", confidence: 1.0, reason: "PTZ presets standard" },
      { path: "ptz.tours", confidence: 0.9, reason: "Tours commonly supported" },
      { path: "network.onvif.profileS", confidence: 0.95, reason: "ONVIF Profile S standard" },
    ],
  },
  // CP Plus IP Cameras
  {
    vendor: "cp-plus",
    modelPattern: /CP-\w+-\w+/i,
    capabilities: [
      { path: "video.liveVideo", confidence: 1.0, reason: "Standard IP camera" },
      { path: "video.rtsp", confidence: 1.0, reason: "CP Plus supports RTSP" },
      { path: "video.codecs.h264", confidence: 1.0, reason: "H.264 standard" },
      { path: "video.codecs.h265", confidence: 0.8, reason: "H.265 in newer models" },
      { path: "network.onvif.profileS", confidence: 0.9, reason: "ONVIF Profile S supported" },
      { path: "events.motionDetection", confidence: 1.0, reason: "Built-in motion detection" },
    ],
  },
  // Generic ONVIF Camera
  {
    vendor: "*",
    modelPattern: /.*/,
    capabilities: [
      { path: "video.liveVideo", confidence: 0.95, reason: "ONVIF camera default" },
      { path: "video.snapshots", confidence: 0.9, reason: "ONVIF standard capability" },
      { path: "network.onvif.core", confidence: 1.0, reason: "ONVIF device" },
    ],
  },
];

/**
 * Model database capability probe.
 * 
 * This provides DECLARED capabilities based on vendor documentation
 * and model specifications.
 */
export class ModelDatabaseProbe implements CapabilityProbe {
  readonly id = "model-database";
  readonly priority = 50;

  supports(device: DeviceIdentity): boolean {
    // Always runs as a baseline
    return true;
  }

  async probe(context: CapabilityProbeContext): Promise<CapabilityObservation[]> {
    const { device } = context;
    const observations: CapabilityObservation[] = [];

    try {
      // Find matching specs
      const matchingSpecs = this.findMatchingSpecs(device);

      for (const spec of matchingSpecs) {
        for (const cap of spec.capabilities) {
          observations.push({
            capabilityPath: cap.path,
            evidence: {
              source: "MODEL_DATABASE",
              observedAt: new Date(),
              confidence: cap.confidence,
              verified: false,
              evidenceType: "Model Specification",
              reason: cap.reason,
            },
            value: cap.value,
          });
        }
      }

      // Add vendor-specific capabilities
      observations.push(...this.getVendorCapabilities(device));

      return observations;
    } catch (error) {
      throw new ProbeError(
        this.id,
        device.deviceId,
        "Failed to probe model database",
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============ PRIVATE METHODS ============

  private findMatchingSpecs(device: DeviceIdentity): ModelSpec[] {
    const vendor = device.vendor?.toLowerCase() ?? "";
    const model = device.model ?? "";

    return MODEL_SPECS.filter((spec) => {
      // Check vendor match
      if (spec.vendor !== "*" && !vendor.includes(spec.vendor.toLowerCase())) {
        return false;
      }

      // Check model pattern match
      return spec.modelPattern.test(model);
    });
  }

  private getVendorCapabilities(device: DeviceIdentity): CapabilityObservation[] {
    const vendor = device.vendor?.toLowerCase() ?? "";
    const observations: CapabilityObservation[] = [];

    // Hikvision-specific
    if (vendor.includes("hikvision")) {
      observations.push(
        {
          capabilityPath: "security.https",
          evidence: {
            source: "MODEL_DATABASE",
            observedAt: new Date(),
            confidence: 1.0,
            verified: false,
            evidenceType: "Vendor Specification",
            reason: "Hikvision supports HTTPS",
          },
        },
        {
          capabilityPath: "storage.onboardStorage",
          evidence: {
            source: "MODEL_DATABASE",
            observedAt: new Date(),
            confidence: 0.8,
            verified: false,
            evidenceType: "Vendor Specification",
            reason: "Most Hikvision cameras support SD card",
          },
        },
      );
    }

    // CP Plus-specific
    if (vendor.includes("cp-plus") || vendor.includes("cpplus")) {
      observations.push({
        capabilityPath: "storage.onboardStorage",
        evidence: {
          source: "MODEL_DATABASE",
          observedAt: new Date(),
          confidence: 0.7,
          verified: false,
          evidenceType: "Vendor Specification",
          reason: "CP Plus commonly includes SD card support",
        },
      });
    }

    return observations;
  }
}
