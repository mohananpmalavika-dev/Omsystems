import type {
  ApiFamily,
  RecorderDeviceProfile,
  RecorderOperation,
} from "../types/recorder-profile.types.js";
import { operationToCapability } from "../capabilities/capability-registry.js";
import { CP_PLUS_DEFAULT_POLICY } from "./operation-policy.js";

export class RecorderProtocolRouter {
  select(operation: RecorderOperation, profile: RecorderDeviceProfile): ApiFamily[] {
    const capabilityKey = operationToCapability(operation);
    const capability = profile.fingerprint.capabilities[capabilityKey];

    const supportedFamilies: ApiFamily[] = [];

    if (capability && capability.evidence) {
      const candidates = capability.evidence
        .filter((e) => e.state === "SUPPORTED" || e.state === "PARTIAL")
        .sort((a, b) => b.confidence - a.confidence)
        .map((e) => e.source)
        .filter((s): s is ApiFamily => s !== "HTTP");

      supportedFamilies.push(...candidates);
    }

    const preferred = capability?.preferredApi;
    const policyDefault = CP_PLUS_DEFAULT_POLICY[operation];

    const rawList: ApiFamily[] = [
      ...(preferred ? [preferred] : []),
      ...supportedFamilies,
      ...(policyDefault?.primary && profile.fingerprint.detectedApiFamilies[this.toDetectedKey(policyDefault.primary)] ? [policyDefault.primary] : []),
      ...profile.preferredApiOrder,
      ...(policyDefault?.fallback.filter((f) => profile.fingerprint.detectedApiFamilies[this.toDetectedKey(f)]) ?? []),
    ];

    // Deduplicate preserving order
    return this.unique(rawList);
  }

  private toDetectedKey(family: ApiFamily): "onvif" | "dahuaCgi" | "hikvisionIsapi" | "proprietary" | "rtsp" {
    switch (family) {
      case "ONVIF": return "onvif";
      case "DAHUA_CGI": return "dahuaCgi";
      case "HIKVISION_ISAPI": return "hikvisionIsapi";
      case "PROPRIETARY": return "proprietary";
      case "RTSP": return "rtsp";
    }
  }

  private unique(list: ApiFamily[]): ApiFamily[] {
    return Array.from(new Set(list));
  }
}
