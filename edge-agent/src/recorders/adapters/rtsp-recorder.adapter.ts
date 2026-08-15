import type { ApiFamily, RecorderOperation } from "../types/recorder-profile.types.js";
import type { RecorderAdapter, RecorderRequest } from "./recorder-adapter.interface.js";

export class RtspRecorderAdapter implements RecorderAdapter {
  readonly family: ApiFamily = "RTSP";

  async execute<T>(operation: RecorderOperation, req: RecorderRequest): Promise<T> {
    if (operation === "GET_STREAM_URI") {
      const ch = (req.params?.channel as number) ?? 1;
      const uri = `rtsp://${encodeURIComponent(req.username ?? "admin")}:${encodeURIComponent(req.password ?? "")}@${req.host}:${req.rtspPort ?? 554}/live/ch${ch}`;
      return { uri } as unknown as T;
    }
    throw new Error(`Operation ${operation} not supported by RTSP adapter`);
  }
}
