import { authenticatedFetch } from "../../../monitoring/http-auth.js";
import type {
  ProbeContext,
  ProbeEvidence,
  RecorderCapabilities,
  RecorderProbe,
  SupportState,
} from "./recorder-probe.interface.js";

export class HikvisionIsapiProbe implements RecorderProbe {
  readonly id = "hikvision-isapi-probe";
  readonly cost = 3;
  readonly apiFamily = "HIKVISION_ISAPI" as const;

  async run(ctx: ProbeContext): Promise<ProbeEvidence> {
    const started = Date.now();
    const base = `${ctx.secure ? "https" : "http"}://${ctx.host}:${ctx.port}`;
    const credentials = ctx.username
      ? { username: ctx.username, password: ctx.password ?? "" }
      : undefined;

    const probeResults: Record<string, { status: number; text: string }> = {};
    let authChallenged = false;

    const endpoints = [
      { name: "deviceInfo", path: "/ISAPI/System/deviceInfo" },
      { name: "storage", path: "/ISAPI/ContentMgmt/Storage" },
      { name: "channels", path: "/ISAPI/System/Video/inputs/channels" },
      { name: "channelStatus", path: "/ISAPI/ContentMgmt/InputProxy/channels/status" },
    ];

    for (const ep of endpoints) {
      if (ctx.abortSignal.aborted) throw new Error("Probe cancelled");
      try {
        const res = await authenticatedFetch(
          `${base}${ep.path}`,
          { method: "GET" },
          credentials,
          ctx.requestTimeoutMs,
        );

        if (res.status === 401 || res.status === 403) {
          authChallenged = true;
        }

        const text = await res.text().catch(() => "");
        probeResults[ep.name] = { status: res.status, text };
      } catch (err) {
        probeResults[ep.name] = { status: 0, text: "" };
      }
    }

    const latencyMs = Date.now() - started;
    const devInfo = probeResults["deviceInfo"];
    const isIsapi = isIsapiXml(devInfo?.text ?? "") ||
      isIsapiXml(probeResults["storage"]?.text ?? "") ||
      isIsapiXml(probeResults["channels"]?.text ?? "");

    if (isIsapi && devInfo && devInfo.status === 200) {
      const xml = devInfo.text;
      const model = tag(xml, "model") ?? tag(xml, "deviceName");
      const manufacturer = tag(xml, "manufacturer") ?? (ctx.configuredVendor ? ctx.configuredVendor : "Hikvision");
      const firmwareVersion = tag(xml, "firmwareVersion") ?? tag(xml, "softwareVersion") ?? "";
      const serialNumber = tag(xml, "serialNumber") ?? "";

      const storageXml = probeResults["storage"]?.text ?? "";
      const hasDisks = /<hdd/i.test(storageXml);
      const hasSmart = /<smartStatus|<health|<temperature/i.test(storageXml);

      const channelsXml = probeResults["channels"]?.text ?? "";
      const channelMatches = [...channelsXml.matchAll(/<VideoInputChannel/g)];

      const capabilities: Partial<Record<keyof RecorderCapabilities, SupportState>> = {
        deviceInfo: "SUPPORTED",
        channels: channelMatches.length > 0 ? "SUPPORTED" : "PARTIAL",
        storageStatus: hasDisks ? "SUPPORTED" : "UNKNOWN",
        smartTelemetry: hasSmart ? "SUPPORTED" : hasDisks ? "PARTIAL" : "UNKNOWN",
        recordingStatus: "SUPPORTED",
        playbackSearch: "SUPPORTED",
        deviceTime: "SUPPORTED",
      };

      return {
        apiFamily: "HIKVISION_ISAPI",
        probeId: "hikvision-isapi-probe",
        outcome: "MATCH",
        confidence: 0.96,
        identity: {
          manufacturer,
          model: model ?? "Hikvision/Compatible",
          firmwareVersion,
          serialNumber,
        },
        capabilities,
        preferredApiFor: [
          "deviceInfo",
          "channels",
          "storageStatus",
          "recordingStatus",
          "playbackSearch",
          "deviceTime",
        ],
        metadata: {
          channelCount: channelMatches.length,
          hasDisks,
          hasSmart,
        },
        latencyMs,
        statusCode: 200,
        observedAt: new Date().toISOString(),
      };
    }

    if (authChallenged) {
      return {
        apiFamily: "HIKVISION_ISAPI",
        probeId: "hikvision-isapi-probe",
        outcome: "AUTH_REQUIRED",
        confidence: 0.70,
        capabilities: {
          deviceInfo: "PARTIAL",
          channels: "UNKNOWN",
          storageStatus: "UNKNOWN",
          smartTelemetry: "UNKNOWN",
        },
        reason: "Hikvision ISAPI endpoints returned 401 Unauthorized or digest challenge",
        latencyMs,
        statusCode: 401,
        observedAt: new Date().toISOString(),
      };
    }

    return {
      apiFamily: "HIKVISION_ISAPI",
      probeId: "hikvision-isapi-probe",
      outcome: "NO_MATCH",
      confidence: 0.1,
      reason: "Hikvision ISAPI endpoints not available or returned non-ISAPI responses",
      latencyMs,
      observedAt: new Date().toISOString(),
    };
  }
}

export function isIsapiXml(xml: string): boolean {
  if (!xml) return false;
  return /<(DeviceInfo|Storage|VideoInputChannelList|InputProxyChannelStatusList|ResponseStatus)/i.test(xml);
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}[^>]*>([^<]+)</${name}>`, "i"));
  return match && match[1] ? match[1].trim() : null;
}
