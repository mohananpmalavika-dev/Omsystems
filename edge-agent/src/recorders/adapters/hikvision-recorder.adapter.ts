import { authenticatedFetch } from "../../monitoring/http-auth.js";
import type { ApiFamily, RecorderOperation } from "../types/recorder-profile.types.js";
import type { RecorderAdapter, RecorderRequest } from "./recorder-adapter.interface.js";

export class HikvisionRecorderAdapter implements RecorderAdapter {
  readonly family: ApiFamily = "HIKVISION_ISAPI";

  async execute<T>(operation: RecorderOperation, req: RecorderRequest): Promise<T> {
    const base = `${req.secure ? "https" : "http"}://${req.host}:${req.port}`;
    const credentials = req.username ? { username: req.username, password: req.password ?? "" } : undefined;
    const timeout = req.timeoutMs ?? 8000;

    switch (operation) {
      case "GET_DEVICE_INFO": {
        const res = await authenticatedFetch(`${base}/ISAPI/System/deviceInfo`, { method: "GET" }, credentials, timeout);
        if (!res.ok) throw new Error(`hikvision_http_${res.status}`);
        const xml = await res.text();
        const tag = (name: string): string | undefined => {
          const match = xml.match(new RegExp(`<${name}[^>]*>([^<]+)</${name}>`, "i"));
          return match && match[1] ? match[1].trim() : undefined;
        };
        return {
          model: tag("model") ?? tag("deviceName") ?? "Unknown",
          serialNumber: tag("serialNumber") ?? "",
          firmwareVersion: tag("firmwareVersion") ?? "",
        } as unknown as T;
      }
      case "GET_STREAM_URI": {
        const ch = (req.params?.channel as number) ?? 1;
        const sub = (req.params?.sub as boolean) ? "02" : "01";
        const uri = `rtsp://${encodeURIComponent(req.username ?? "admin")}:${encodeURIComponent(req.password ?? "")}@${req.host}:${req.rtspPort ?? 554}/Streaming/Channels/${ch}${sub}`;
        return { uri } as unknown as T;
      }
      default:
        throw new Error(`Operation ${operation} not implemented for Hikvision ISAPI adapter`);
    }
  }
}
