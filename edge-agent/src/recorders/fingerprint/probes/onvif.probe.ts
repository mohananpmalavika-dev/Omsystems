import { OnvifClient, type OnvifCredentials } from "../../../devices/onvif-client.js";
import type { ProbeContext, ProbeEvidence, RecorderProbe } from "./recorder-probe.interface.js";

export class OnvifProbe implements RecorderProbe {
  readonly id = "onvif-probe";
  readonly cost = 3;
  readonly apiFamily = "ONVIF" as const;

  async run(ctx: ProbeContext): Promise<ProbeEvidence> {
    const started = Date.now();
    const ports = ctx.httpPorts?.length ? ctx.httpPorts : [ctx.port, 80, 8080, 8899, 5000, 8000];
    const credentials: OnvifCredentials = {
      username: ctx.username ?? "admin",
      password: ctx.password ?? "",
    };

    let lastError: Error | null = null;
    let authRequired = false;

    for (const port of ports) {
      if (ctx.abortSignal.aborted) throw new Error("Probe cancelled");
      const deviceUrl = `${ctx.secure ? "https" : "http"}://${ctx.host}:${port}/onvif/device_service`;

      try {
        const client = new OnvifClient(deviceUrl, credentials, ctx.requestTimeoutMs);
        const details = await client.inspect();

        const latencyMs = Date.now() - started;
        return {
          apiFamily: "ONVIF",
          probeId: "onvif-probe",
          outcome: "MATCH",
          confidence: 0.95,
          identity: {
            manufacturer: details.manufacturer,
            model: details.model,
            firmwareVersion: details.firmwareVersion,
            serialNumber: details.serialNumber,
          },
          capabilities: {
            deviceInfo: "SUPPORTED",
            channels: details.profiles.length > 0 ? "SUPPORTED" : "PARTIAL",
            liveStream: details.profiles.length > 0 ? "SUPPORTED" : "UNKNOWN",
            ptz: details.capabilities.ptz ? "SUPPORTED" : "UNKNOWN",
            events: details.capabilities.events ? "SUPPORTED" : "UNKNOWN",
          },
          preferredApiFor: ["liveStream", "ptz"],
          metadata: {
            services: details.services,
            profileCount: details.profiles.length,
            timeSynchronization: details.timeSynchronization,
            clockOffsetMs: details.clockOffsetMs,
            deviceUrl,
          },
          latencyMs,
          statusCode: 200,
          observedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message ?? err);
        if (msg.includes("401") || msg.includes("authentication") || msg.includes("Unauthorized")) {
          authRequired = true;
        }
      }
    }

    const latencyMs = Date.now() - started;

    if (authRequired) {
      return {
        apiFamily: "ONVIF",
        probeId: "onvif-probe",
        outcome: "AUTH_REQUIRED",
        confidence: 0.75,
        capabilities: {
          deviceInfo: "PARTIAL",
        },
        reason: "ONVIF endpoint recognized but authentication failed or was challenged",
        latencyMs,
        statusCode: 401,
        observedAt: new Date().toISOString(),
      };
    }

    return {
      apiFamily: "ONVIF",
      probeId: "onvif-probe",
      outcome: "NO_MATCH",
      confidence: 0.1,
      reason: lastError ? String(lastError.message ?? lastError) : "ONVIF service not reachable",
      latencyMs,
      observedAt: new Date().toISOString(),
    };
  }
}
