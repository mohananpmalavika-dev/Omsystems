import { createHash } from "node:crypto";
import type { RecorderFingerprint } from "../types/recorder-profile.types.js";

export function buildFingerprintSignature(fp: RecorderFingerprint): string {
  const normalize = (str?: string) => (str ?? "").trim().toLowerCase();

  const capabilityStates: Record<string, string> = {};
  if (fp.capabilities) {
    for (const [key, cap] of Object.entries(fp.capabilities)) {
      capabilityStates[key] = cap.state;
    }
  }

  const stable = {
    manufacturer: normalize(fp.manufacturer),
    model: normalize(fp.model),
    firmwareVersion: normalize(fp.firmwareVersion),
    serialNumber: normalize(fp.serialNumber),
    detectedApiFamilies: {
      onvif: Boolean(fp.detectedApiFamilies?.onvif),
      dahuaCgi: Boolean(fp.detectedApiFamilies?.dahuaCgi),
      hikvisionIsapi: Boolean(fp.detectedApiFamilies?.hikvisionIsapi),
      proprietary: Boolean(fp.detectedApiFamilies?.proprietary),
      rtsp: Boolean(fp.detectedApiFamilies?.rtsp),
    },
    capabilityStates,
  };

  const json = canonicalJson(stable);
  return createHash("sha256").update(json).digest("hex");
}

function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${entries.join(",")}}`;
}
