export type CameraStatus = "online" | "offline" | "degraded" | "unknown";

export interface Branch {
  id: string;
  name: string;
  type: "branch";
  cameraCount?: number;
  onlineCount?: number;
}

export interface Camera {
  id: string;
  name: string;
  branchId: string;
  branchName?: string;
  vendor: "hikvision" | "cp-plus" | "other";
  model: string;
  status: CameraStatus;
  channel: number;
  capabilities: {
    ptz: boolean;
    audio: boolean;
    events: boolean;
  };
}

export interface LiveSessionResponse {
  demo?: boolean;
  sessionId?: string;
  cameraId: string;
  expiresAt?: string;
  hls?: {
    url: string;
    bearerToken: string;
  };
  webRtc?: {
    whepUrl: string;
    bearerToken: string;
  };
}
