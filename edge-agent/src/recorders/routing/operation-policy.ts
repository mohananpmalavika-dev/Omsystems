import type {
  ApiFamily,
  RecorderOperation,
} from "../types/recorder-profile.types.js";

export interface OperationPolicyRule {
  primary: ApiFamily;
  fallback: ApiFamily[];
}

export const CP_PLUS_DEFAULT_POLICY: Record<RecorderOperation, OperationPolicyRule> = {
  GET_DEVICE_INFO: {
    primary: "DAHUA_CGI",
    fallback: ["ONVIF", "HIKVISION_ISAPI"],
  },
  LIST_CHANNELS: {
    primary: "DAHUA_CGI",
    fallback: ["ONVIF", "HIKVISION_ISAPI"],
  },
  GET_STREAM_URI: {
    primary: "ONVIF",
    fallback: ["DAHUA_CGI", "RTSP"],
  },
  GET_RECORDING_STATUS: {
    primary: "DAHUA_CGI",
    fallback: ["ONVIF"],
  },
  SEARCH_RECORDINGS: {
    primary: "DAHUA_CGI",
    fallback: ["ONVIF"],
  },
  GET_STORAGE: {
    primary: "DAHUA_CGI",
    fallback: ["HIKVISION_ISAPI"],
  },
  GET_DEVICE_TIME: {
    primary: "DAHUA_CGI",
    fallback: ["ONVIF"],
  },
  GET_PTZ: {
    primary: "ONVIF",
    fallback: ["DAHUA_CGI"],
  },
  GET_EVENTS: {
    primary: "ONVIF",
    fallback: ["DAHUA_CGI"],
  },
};
