import type {
  ProbeContext,
  ProbeEvidence,
  RecorderProbe,
} from "./recorder-probe.interface.js";

export class ProprietaryProbe implements RecorderProbe {
  readonly id = "proprietary-probe";
  readonly cost = 1;
  readonly apiFamily = "PROPRIETARY" as const;

  async run(ctx: ProbeContext): Promise<ProbeEvidence> {
    const started = Date.now();
    const vendor = (ctx.configuredVendor ?? "").toLowerCase();

    // Placeholder / extension point for proprietary DVR/NVR SDK protocols
    const latencyMs = Date.now() - started;
    return {
      apiFamily: "PROPRIETARY",
      probeId: "proprietary-probe",
      outcome: "NO_MATCH",
      confidence: 0.05,
      reason: `No custom proprietary adapter configured for vendor ${vendor || "generic"}`,
      latencyMs,
      observedAt: new Date().toISOString(),
    };
  }
}
