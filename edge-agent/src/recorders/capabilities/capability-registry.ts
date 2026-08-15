import type {
  ApiFamily,
  RecorderCapabilities,
  RecorderOperation,
} from "../types/recorder-profile.types.js";

export interface CapabilityDefinition {
  key: keyof RecorderCapabilities;
  name: string;
  description: string;
  operations: RecorderOperation[];
  defaultPreferredApi?: ApiFamily;
}

export const RECORDER_CAPABILITY_REGISTRY: Record<keyof RecorderCapabilities, CapabilityDefinition> = {
  deviceInfo: {
    key: "deviceInfo",
    name: "Device Information",
    description: "Model, firmware, serial number and system identity telemetry",
    operations: ["GET_DEVICE_INFO"],
  },
  channels: {
    key: "channels",
    name: "Channel Inventory",
    description: "Enumerated camera/analog channels and connected state",
    operations: ["LIST_CHANNELS"],
  },
  liveStream: {
    key: "liveStream",
    name: "Live RTSP Streaming",
    description: "Main and sub-stream RTSP URI resolution and media playback",
    operations: ["GET_STREAM_URI"],
  },
  recordingStatus: {
    key: "recordingStatus",
    name: "Recording Status Telemetry",
    description: "Per-channel writing status verified with media searches",
    operations: ["GET_RECORDING_STATUS"],
  },
  playbackSearch: {
    key: "playbackSearch",
    name: "Recording Archive Search",
    description: "Search historical archive timeline segments and index",
    operations: ["SEARCH_RECORDINGS"],
  },
  storageStatus: {
    key: "storageStatus",
    name: "Storage & Disk Health",
    description: "Storage disk enumeration, capacity, and usage status",
    operations: ["GET_STORAGE"],
  },
  smartTelemetry: {
    key: "smartTelemetry",
    name: "HDD S.M.A.R.T. Telemetry",
    description: "Deep disk health indicators, raw read error, reallocated sectors, temp",
    operations: ["GET_STORAGE"],
  },
  deviceTime: {
    key: "deviceTime",
    name: "Device Clock & NTP",
    description: "Recorder system time, timezone and drift synchronization",
    operations: ["GET_DEVICE_TIME"],
  },
  events: {
    key: "events",
    name: "Event Notifications",
    description: "Motion, video loss, tampering, and alarm input subscriptions",
    operations: ["GET_EVENTS"],
  },
  ptz: {
    key: "ptz",
    name: "PTZ Telemetry & Control",
    description: "Pan-tilt-zoom profile support and control operations",
    operations: ["GET_PTZ"],
  },
};

export function operationToCapability(op: RecorderOperation): keyof RecorderCapabilities {
  switch (op) {
    case "GET_DEVICE_INFO":
      return "deviceInfo";
    case "LIST_CHANNELS":
      return "channels";
    case "GET_STREAM_URI":
      return "liveStream";
    case "GET_RECORDING_STATUS":
      return "recordingStatus";
    case "SEARCH_RECORDINGS":
      return "playbackSearch";
    case "GET_STORAGE":
      return "storageStatus";
    case "GET_DEVICE_TIME":
      return "deviceTime";
    case "GET_PTZ":
      return "ptz";
    case "GET_EVENTS":
      return "events";
    default:
      return "deviceInfo";
  }
}
