import { authenticatedFetch } from "../../../monitoring/http-auth.js";
import type {
  ProbeContext,
  ProbeEvidence,
  RecorderCapabilities,
  RecorderProbe,
  SupportState,
} from "./recorder-probe.interface.js";

interface DahuaSystemInfo {
  deviceType?: string | undefined;
  serialNumber?: string | undefined;
  softwareVersion?: string | undefined;
  hardwareVersion?: string | undefined;
  processor?: string | undefined;
  rawText: string;
}

export class DahuaCgiProbe implements RecorderProbe {
  readonly id = "dahua-cgi-probe";
  readonly cost = 3;
  readonly apiFamily = "DAHUA_CGI" as const;

  async run(ctx: ProbeContext): Promise<ProbeEvidence> {
    const started = Date.now();
    const base = `${ctx.secure ? "https" : "http"}://${ctx.host}:${ctx.port}`;
    const credentials = ctx.username
      ? { username: ctx.username, password: ctx.password ?? "" }
      : undefined;

    const probeResults: Record<string, { status: number; text: string }> = {};
    let authChallenged = false;

    const endpoints = [
      { name: "system", path: "/cgi-bin/magicBox.cgi?action=getSystemInfo" },
      { name: "channels", path: "/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle" },
      { name: "storage", path: "/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo" },
      { name: "deviceTime", path: "/cgi-bin/global.cgi?action=getCurrentTime" },
    ];

    for (const ep of endpoints) {
      if (ctx.abortSignal.aborted) break;
      try {
        const res = await authenticatedFetch(
          `${base}${ep.path}`,
          { method: "GET", signal: ctx.abortSignal },
          credentials,
          ctx.requestTimeoutMs,
        );

        if (res.status === 401) {
          authChallenged = true;
          probeResults[ep.name] = { status: 401, text: "" };
        } else if (res.ok) {
          const text = await res.text();
          probeResults[ep.name] = { status: res.status, text };
        } else {
          probeResults[ep.name] = { status: res.status, text: "" };
        }
      } catch (err: any) {
        probeResults[ep.name] = { status: 0, text: err?.message ?? "network_error" };
      }
    }

    const latencyMs = Date.now() - started;

    // Check if systemInfo or channel config successfully parsed
    const systemInfoText = probeResults.system?.text ?? "";
    const systemInfo = parseDahuaSystemInfo(systemInfoText);
    const channelText = probeResults.channels?.text ?? "";
    const channelInfo = parseDahuaChannels(channelText);
    const storageText = probeResults.storage?.text ?? "";
    const storageInfo = assessDahuaStorage(storageText);

    const hasSystemMatch = Boolean(systemInfo.deviceType || systemInfo.softwareVersion || systemInfo.processor);
    const hasChannelMatch = channelInfo.count > 0;
    const hasStorageMatch = storageInfo.hasStorage;

    if (hasSystemMatch || hasChannelMatch || hasStorageMatch) {
      const caps: Partial<Record<keyof RecorderCapabilities, SupportState>> = {
        deviceInfo: hasSystemMatch ? "SUPPORTED" : "PARTIAL",
        channels: hasChannelMatch ? "SUPPORTED" : "PARTIAL",
        storageStatus: storageInfo.hasStorage ? "SUPPORTED" : "PARTIAL",
        smartTelemetry: storageInfo.hasSmart ? "SUPPORTED" : storageInfo.hasStorage ? "PARTIAL" : "UNKNOWN",
        recordingStatus: "SUPPORTED",
        playbackSearch: "SUPPORTED",
        deviceTime: probeResults.deviceTime?.status === 200 ? "SUPPORTED" : "PARTIAL",
      };

      const preferred: Array<keyof RecorderCapabilities> = [];
      if (hasSystemMatch) preferred.push("deviceInfo");
      if (hasChannelMatch) preferred.push("channels");
      if (hasStorageMatch) preferred.push("storageStatus");
      preferred.push("recordingStatus", "playbackSearch");

      return {
        apiFamily: "DAHUA_CGI",
        probeId: this.id,
        outcome: "MATCH",
        confidence: hasSystemMatch && hasChannelMatch ? 0.98 : 0.90,
        identity: {
          manufacturer: systemInfo.deviceType?.toLowerCase().startsWith("cp") ? "CP PLUS" : "Dahua",
          model: systemInfo.deviceType,
          firmwareVersion: systemInfo.softwareVersion,
          serialNumber: systemInfo.serialNumber,
        },
        capabilities: caps,
        preferredApiFor: preferred,
        latencyMs,
        statusCode: 200,
        metadata: {
          channelCount: channelInfo.count,
          rawSystemInfo: systemInfo.rawText.slice(0, 500),
          storageSummary: storageInfo,
        },
        observedAt: new Date().toISOString(),
      };
    }

    if (authChallenged) {
      return {
        apiFamily: "DAHUA_CGI",
        probeId: this.id,
        outcome: "AUTH_REQUIRED",
        confidence: 0.70, // 401 on Dahua CGI path is strong evidence family exists
        latencyMs,
        statusCode: 401,
        reason: "HTTP 401 Unauthorized on /cgi-bin/ endpoints",
        observedAt: new Date().toISOString(),
      };
    }

    return {
      apiFamily: "DAHUA_CGI",
      probeId: this.id,
      outcome: "NO_MATCH",
      confidence: 0.05,
      latencyMs,
      statusCode: probeResults.system?.status ?? 0,
      observedAt: new Date().toISOString(),
    };
  }
}

export function isDahuaCgiResponse(body: string): boolean {
  if (!body) return false;
  return /(?:table\.|deviceType=|softwareVersion=|serialNumber=|ChannelTitle|storageDevice)/i.test(body);
}

function parseDahuaSystemInfo(text: string): DahuaSystemInfo {
  const getVal = (k: string): string | undefined => {
    const match = text.match(new RegExp(`${k}=(.*)`, "i"));
    return match && match[1] ? match[1].trim() : undefined;
  };

  return {
    deviceType: getVal("deviceType") ?? getVal("model") ?? getVal("productName") ?? undefined,
    serialNumber: getVal("serialNumber") ?? undefined,
    softwareVersion: getVal("softwareVersion") ?? getVal("version") ?? undefined,
    hardwareVersion: getVal("hardwareVersion") ?? undefined,
    processor: getVal("processor") ?? undefined,
    rawText: text,
  };
}

function parseDahuaChannels(text: string): { count: number; titles: string[] } {
  if (!text) return { count: 0, titles: [] };
  const matches = [...text.matchAll(/ChannelTitle\[(\d+)\]\.Name=(.*)/g)];
  const titles = matches.map((m) => (m && m[2] ? m[2].trim() : ""));
  return {
    count: titles.length,
    titles,
  };
}

function assessDahuaStorage(text: string): {
  hasStorage: boolean;
  hasSmart: boolean;
  driveCount: number;
} {
  if (!text) return { hasStorage: false, hasSmart: false, driveCount: 0 };
  const hasDrive = /table\.Drive\[\d+\]/i.test(text);
  const driveMatches = [...text.matchAll(/table\.Drive\[(\d+)\]\.Name/g)];
  const driveCount = driveMatches.length;

  // Strict SMART verification: Must contain genuine SMART telemetry fields (not just generic status)
  const hasSmart = /SmartStatus=Passed|SmartStatus=OK|Temperature=\d+/i.test(text);

  return {
    hasStorage: hasDrive || driveCount > 0,
    hasSmart,
    driveCount,
  };
}
