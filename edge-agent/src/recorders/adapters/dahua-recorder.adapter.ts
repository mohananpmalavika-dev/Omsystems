import { authenticatedFetch } from "../../monitoring/http-auth.js";
import type { ApiFamily, RecorderOperation } from "../types/recorder-profile.types.js";
import type { RecorderAdapter, RecorderRequest } from "./recorder-adapter.interface.js";

export class DahuaRecorderAdapter implements RecorderAdapter {
  readonly family: ApiFamily = "DAHUA_CGI";

  async execute<T>(operation: RecorderOperation, req: RecorderRequest): Promise<T> {
    const base = `${req.secure ? "https" : "http"}://${req.host}:${req.port}`;
    const credentials = req.username ? { username: req.username, password: req.password ?? "" } : undefined;
    const timeout = req.timeoutMs ?? 8000;

    switch (operation) {
      case "GET_DEVICE_INFO": {
        const res = await authenticatedFetch(`${base}/cgi-bin/magicBox.cgi?action=getSystemInfo`, { method: "GET" }, credentials, timeout);
        if (!res.ok) throw new Error(`dahua_http_${res.status}`);
        const text = await res.text();
        const getVal = (k: string): string | undefined => {
          const m = text.match(new RegExp(`${k}=(.*)`, "i"));
          return m && m[1] ? m[1].trim() : undefined;
        };
        return {
          model: getVal("deviceType") ?? getVal("model") ?? "Unknown",
          serialNumber: getVal("serialNumber") ?? "",
          firmwareVersion: getVal("softwareVersion") ?? getVal("version") ?? "",
        } as unknown as T;
      }
      case "LIST_CHANNELS": {
        const res = await authenticatedFetch(`${base}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`, { method: "GET" }, credentials, timeout);
        if (!res.ok) throw new Error(`dahua_http_${res.status}`);
        const text = await res.text();
        const matches = [...text.matchAll(/ChannelTitle\[(\d+)\]\.Name=(.*)/g)];
        return matches.map((m) => ({
          channel: Number(m[1]),
          name: m && m[2] ? m[2].trim() : "",
        })) as unknown as T;
      }
      case "GET_STORAGE": {
        const res = await authenticatedFetch(`${base}/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo`, { method: "GET" }, credentials, timeout);
        if (!res.ok) throw new Error(`dahua_http_${res.status}`);
        const text = await res.text();
        return { rawText: text } as unknown as T;
      }
      case "GET_STREAM_URI": {
        const ch = (req.params?.channel as number) ?? 1;
        const subtype = (req.params?.subtype as number) ?? 0;
        const uri = `rtsp://${encodeURIComponent(req.username ?? "admin")}:${encodeURIComponent(req.password ?? "")}@${req.host}:${req.rtspPort ?? 554}/cam/realmonitor?channel=${ch}&subtype=${subtype}`;
        return { uri } as unknown as T;
      }
      default:
        throw new Error(`Operation ${operation} not implemented for Dahua adapter`);
    }
  }
}
