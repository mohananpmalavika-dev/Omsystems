/**
 * Hardware Compatibility Lab — Known Device Fixtures
 *
 * Seed data for the 5 supported vendors.
 * Each fixture is a CompatibilityTestTarget describing real-world hardware
 * observed in customer deployments: model IDs, firmware versions, codecs,
 * auth modes, and device generation labels.
 *
 * These are NOT hardcoded results — they are the *test targets* that the
 * lab runner exercises to produce actual PASS/FAIL results.
 */

import type {
  AuthMode,
  CodecEntry,
  CompatibilityTestTarget,
  CompatibilityVendor,
} from "../domain/compatibility-lab.types.js";

// ─── CP PLUS ──────────────────────────────────────────────────────────────────

const cpPlusTargets: CompatibilityTestTarget[] = [
  {
    vendor: "CP_PLUS",
    modelId: "CP-UNR-4K4322-V2",
    firmwareVersion: "3.2.1 build 241001",
    generation: "Gen2",
    deviceClass: "NVR",
    channels: 32,
    description: "32ch 4K UHD Network Video Recorder",
    authModes: ["DIGEST", "BASIC", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720", "640x480"] },
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"], smartCodec: true },
      { codec: "H264+", resolutions: ["1920x1080", "1280x720"] },
    ],
    onvifProfiles: ["S", "T"],
  },
  {
    vendor: "CP_PLUS",
    modelId: "CP-UNR-4K4322-V2",
    firmwareVersion: "4.1.0 build 250115",
    generation: "Gen2",
    deviceClass: "NVR",
    channels: 32,
    description: "32ch 4K UHD Network Video Recorder (newer firmware)",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY", "ONVIF_WS_SECURITY_TOKEN"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"], smartCodec: true },
      { codec: "H265+", resolutions: ["3840x2160"], smartCodec: true },
    ],
    onvifProfiles: ["S", "T", "G"],
  },
  {
    vendor: "CP_PLUS",
    modelId: "CP-UNR-4K1681-V3",
    firmwareVersion: "4.120.00 build 250301",
    generation: "Gen3",
    deviceClass: "NVR",
    channels: 16,
    description: "16ch 4K H.265+ Network Video Recorder Gen3",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY_TOKEN"],
    codecSupport: [
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"], smartCodec: true },
      { codec: "H265+", resolutions: ["3840x2160"], smartCodec: true },
      { codec: "H264", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T", "G"],
  },
  {
    vendor: "CP_PLUS",
    modelId: "CP-USC-TC91L1-MD",
    firmwareVersion: "3.2.1 build 241001",
    generation: "Gen2",
    deviceClass: "IP_CAMERA",
    description: "2MP StarLight Turret WDR IR Network Camera",
    authModes: ["BASIC", "DIGEST", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720", "640x480"] },
      { codec: "H265", resolutions: ["1920x1080"] },
      { codec: "MJPEG", resolutions: ["1920x1080", "640x480"] },
    ],
    onvifProfiles: ["S", "T"],
  },
];

// ─── DAHUA ────────────────────────────────────────────────────────────────────

const dahuaTargets: CompatibilityTestTarget[] = [
  {
    vendor: "DAHUA",
    modelId: "DHI-NVR4116HS-4KS3",
    firmwareVersion: "V3.216.0000000.3 build 230818",
    generation: "4KS3",
    deviceClass: "NVR",
    channels: 16,
    description: "16ch 1U Lite 4K H.265 NVR",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"], smartCodec: true },
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
      { codec: "H264+", resolutions: ["1920x1080"] },
      { codec: "H265+", resolutions: ["3840x2160"] },
    ],
    onvifProfiles: ["S", "T", "G"],
  },
  {
    vendor: "DAHUA",
    modelId: "DHI-NVR4116HS-4KS3",
    firmwareVersion: "V4.000.0000000.0 build 240601",
    generation: "4KS3-Gen4",
    deviceClass: "NVR",
    channels: 16,
    description: "16ch 4K H.265 NVR firmware V4",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY_TOKEN", "BEARER_TOKEN"],
    codecSupport: [
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"], smartCodec: true },
      { codec: "H265+", resolutions: ["3840x2160"], smartCodec: true },
      { codec: "H264", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T", "G", "Q"],
  },
  {
    vendor: "DAHUA",
    modelId: "DHI-IPC-HDW2831T-AS",
    firmwareVersion: "V3.220.0000000.1 build 231201",
    generation: "2831 Series",
    deviceClass: "IP_CAMERA",
    description: "8MP Lite IR Fixed-focal Eyeball Network Camera",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"] },
      { codec: "H264", resolutions: ["3840x2160", "1920x1080", "1280x720"] },
      { codec: "MJPEG", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T"],
  },
  {
    vendor: "DAHUA",
    modelId: "SD49425XB-HNR",
    firmwareVersion: "V3.216.0000000.2 build 230615",
    generation: "WizMind PTZ",
    deviceClass: "PTZ_CAMERA",
    description: "4MP IR Vari-focal PTZ WizMind Network Camera",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H265", resolutions: ["2688x1520", "1920x1080"] },
      { codec: "H264", resolutions: ["2688x1520", "1920x1080", "1280x720"] },
    ],
    onvifProfiles: ["S", "T"],
  },
];

// ─── HIKVISION ────────────────────────────────────────────────────────────────

const hikvisionTargets: CompatibilityTestTarget[] = [
  {
    vendor: "HIKVISION",
    modelId: "DS-7616NI-I2",
    firmwareVersion: "V4.62.00 build 220929",
    generation: "I2 Series",
    deviceClass: "NVR",
    channels: 16,
    description: "16ch 8MP H.265 Acupix NVR",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"] },
      { codec: "H264", resolutions: ["1920x1080", "1280x720", "640x480"] },
      { codec: "MJPEG", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T", "G"],
  },
  {
    vendor: "HIKVISION",
    modelId: "DS-7616NI-I2",
    firmwareVersion: "V4.71.00 build 231028",
    generation: "I2 Series",
    deviceClass: "NVR",
    channels: 16,
    description: "16ch 8MP H.265 Acupix NVR (newer firmware)",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY_TOKEN"],
    codecSupport: [
      { codec: "H265", resolutions: ["3840x2160", "1920x1080"], smartCodec: true },
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
    ],
    onvifProfiles: ["S", "T", "G"],
  },
  {
    vendor: "HIKVISION",
    modelId: "DS-2CD2347G2-LU",
    firmwareVersion: "V5.07.18 build 240111",
    generation: "AcuSense ColorVu",
    deviceClass: "IP_CAMERA",
    description: "4MP AcuSense Colorvu Fixed Dome Network Camera",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H265", resolutions: ["2688x1520", "1920x1080"], smartCodec: true },
      { codec: "H264", resolutions: ["2688x1520", "1920x1080", "1280x720"] },
      { codec: "MJPEG", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T"],
  },
  {
    vendor: "HIKVISION",
    modelId: "DS-9616NI-M8",
    firmwareVersion: "V4.62.00 build 220929",
    generation: "M8 PRO",
    deviceClass: "NVR",
    channels: 16,
    description: "16ch 32MP NVR with 8 HDDs (PRO Series)",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H265", resolutions: ["7680x4320", "3840x2160", "1920x1080"], smartCodec: true },
      { codec: "H264", resolutions: ["3840x2160", "1920x1080"] },
    ],
    onvifProfiles: ["S", "T", "G"],
  },
];

// ─── AXIS ─────────────────────────────────────────────────────────────────────

const axisTargets: CompatibilityTestTarget[] = [
  {
    vendor: "AXIS",
    modelId: "P3245-V",
    firmwareVersion: "9.80.1",
    generation: "Lightfinder 2.0",
    deviceClass: "IP_CAMERA",
    description: "2MP Fixed Dome Network Camera with Lightfinder",
    authModes: ["DIGEST", "BASIC", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720", "640x480"] },
      { codec: "H265", resolutions: ["1920x1080"] },
      { codec: "MJPEG", resolutions: ["1920x1080", "640x480"] },
    ],
    onvifProfiles: ["S", "T"],
  },
  {
    vendor: "AXIS",
    modelId: "P3245-V",
    firmwareVersion: "10.11.65",
    generation: "Lightfinder 2.0",
    deviceClass: "IP_CAMERA",
    description: "2MP Fixed Dome Network Camera (AXIS OS 10)",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY_TOKEN"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
      { codec: "H265", resolutions: ["1920x1080"] },
      { codec: "AV1", resolutions: ["1920x1080"] },
      { codec: "MJPEG", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T", "Q"],
  },
  {
    vendor: "AXIS",
    modelId: "Q6135-LE",
    firmwareVersion: "11.6.94",
    generation: "AXIS OS 11",
    deviceClass: "PTZ_CAMERA",
    description: "2MP 32× Optical Zoom PTZ Network Camera",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY_TOKEN"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
      { codec: "H265", resolutions: ["1920x1080"] },
      { codec: "AV1", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T", "Q"],
  },
  {
    vendor: "AXIS",
    modelId: "M5525-E",
    firmwareVersion: "10.11.65",
    generation: "AXIS OS 10",
    deviceClass: "PTZ_CAMERA",
    description: "2MP Indoor-Outdoor Mini PTZ Network Camera",
    authModes: ["DIGEST", "ONVIF_WS_SECURITY"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
      { codec: "H265", resolutions: ["1920x1080"] },
      { codec: "MJPEG", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T"],
  },
];

// ─── ONVIF Generic ────────────────────────────────────────────────────────────

const onvifGenericTargets: CompatibilityTestTarget[] = [
  {
    vendor: "ONVIF_GENERIC",
    modelId: "Generic-Dome-ProfileS",
    firmwareVersion: "Profile S",
    generation: "Profile S",
    deviceClass: "IP_CAMERA",
    description: "Any ONVIF Profile S compliant fixed dome camera",
    authModes: ["ONVIF_WS_SECURITY", "DIGEST"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
      { codec: "MJPEG", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S"],
  },
  {
    vendor: "ONVIF_GENERIC",
    modelId: "Generic-PTZ-ProfileT",
    firmwareVersion: "Profile T",
    generation: "Profile T",
    deviceClass: "PTZ_CAMERA",
    description: "Any ONVIF Profile T compliant PTZ camera",
    authModes: ["ONVIF_WS_SECURITY", "ONVIF_WS_SECURITY_TOKEN"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
      { codec: "H265", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "T"],
  },
  {
    vendor: "ONVIF_GENERIC",
    modelId: "Generic-NVR-ProfileG",
    firmwareVersion: "Profile G",
    generation: "Profile G",
    deviceClass: "NVR",
    channels: 16,
    description: "Any ONVIF Profile G compliant NVR with on-device recording",
    authModes: ["ONVIF_WS_SECURITY", "DIGEST"],
    codecSupport: [
      { codec: "H264", resolutions: ["1920x1080", "1280x720"] },
      { codec: "H265", resolutions: ["1920x1080"] },
    ],
    onvifProfiles: ["S", "G"],
  },
];

// ─── Unified Export ───────────────────────────────────────────────────────────

export const KNOWN_DEVICES: readonly CompatibilityTestTarget[] = [
  ...cpPlusTargets,
  ...dahuaTargets,
  ...hikvisionTargets,
  ...axisTargets,
  ...onvifGenericTargets,
];

/** Lookup by vendor */
export function getDevicesByVendor(vendor: CompatibilityVendor): CompatibilityTestTarget[] {
  return KNOWN_DEVICES.filter((d) => d.vendor === vendor);
}

/** Find a specific device+firmware tuple */
export function findDevice(
  vendor: CompatibilityVendor,
  modelId: string,
  firmwareVersion: string,
): CompatibilityTestTarget | undefined {
  return KNOWN_DEVICES.find(
    (d) => d.vendor === vendor && d.modelId === modelId && d.firmwareVersion === firmwareVersion,
  );
}
