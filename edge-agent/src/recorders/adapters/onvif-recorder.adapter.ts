import { OnvifClient } from "../../devices/onvif-client.js";
import type { ApiFamily, RecorderOperation } from "../types/recorder-profile.types.js";
import type { RecorderAdapter, RecorderRequest } from "./recorder-adapter.interface.js";

export class OnvifRecorderAdapter implements RecorderAdapter {
  readonly family: ApiFamily = "ONVIF";

  async execute<T>(operation: RecorderOperation, req: RecorderRequest): Promise<T> {
    const deviceUrl = `${req.secure ? "https" : "http"}://${req.host}:${req.port}/onvif/device_service`;
    const client = new OnvifClient(
      deviceUrl,
      { username: req.username ?? "admin", password: req.password ?? "" },
      req.timeoutMs ?? 8000,
    );

    switch (operation) {
      case "GET_DEVICE_INFO": {
        const details = await client.inspect();
        return {
          manufacturer: details.manufacturer,
          model: details.model,
          firmwareVersion: details.firmwareVersion,
          serialNumber: details.serialNumber,
        } as unknown as T;
      }
      case "LIST_CHANNELS": {
        const details = await client.inspect();
        return details.profiles.map((p: any, idx: number) => ({
          channel: idx + 1,
          name: p.name,
          token: p.token,
          codec: p.codec,
          width: p.width,
          height: p.height,
        })) as unknown as T;
      }
      case "GET_STREAM_URI": {
        const token = (req.params?.profileToken as string) ?? "Profile_1";
        const details = await client.inspect();
        const profile = details.profiles.find((p: any) => p.token === token) ?? details.profiles[0];
        const uri = profile
          ? `rtsp://${encodeURIComponent(req.username ?? "admin")}:${encodeURIComponent(req.password ?? "")}@${req.host}:${req.rtspPort ?? 554}/live`
          : null;
        return { uri } as unknown as T;
      }
      default:
        throw new Error(`Operation ${operation} not supported by ONVIF adapter`);
    }
  }
}
