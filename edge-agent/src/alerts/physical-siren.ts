export interface PhysicalSirenConfig {
  enabled: boolean;
  onUrl?: string | undefined;
  offUrl?: string | undefined;
  method: "GET" | "POST";
  authToken?: string | undefined;
  pulseMs: number;
  timeoutMs: number;
}

export interface PhysicalSirenTrigger {
  alertId: string;
  branchId: string;
  severity: string;
  detectionType: string;
  occurredAt: string;
}

export interface PhysicalSirenResult {
  triggered: boolean;
  alertId: string;
  pulseMs: number;
  reason?: "duplicate_alert";
}

type Fetcher = typeof fetch;
type Delay = (milliseconds: number) => Promise<void>;

/** Drives a fail-safe HTTP dry-contact/network relay at the branch. */
export class PhysicalSirenController {
  private readonly triggeredAlertIds = new Set<string>();

  constructor(
    private readonly config: PhysicalSirenConfig,
    private readonly fetcher: Fetcher = fetch,
    private readonly delay: Delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async trigger(input: PhysicalSirenTrigger): Promise<PhysicalSirenResult> {
    if (!this.config.enabled) throw new Error("physical_siren_disabled");
    if (!this.config.onUrl || !this.config.offUrl) throw new Error("physical_siren_relay_not_configured");
    if (this.triggeredAlertIds.has(input.alertId)) {
      return { triggered: false, alertId: input.alertId, pulseMs: 0, reason: "duplicate_alert" };
    }

    await this.setRelay(this.config.onUrl, "on", input);
    try {
      await this.delay(this.config.pulseMs);
    } finally {
      // Always release the dry contact after a successful ON call.
      await this.setRelay(this.config.offUrl, "off", input);
    }
    this.remember(input.alertId);

    return { triggered: true, alertId: input.alertId, pulseMs: this.config.pulseMs };
  }

  private async setRelay(url: string, state: "on" | "off", input: PhysicalSirenTrigger) {
    const response = await this.fetcher(url, {
      method: this.config.method,
      redirect: "error",
      signal: AbortSignal.timeout(this.config.timeoutMs),
      headers: {
        accept: "application/json",
        ...(this.config.method === "POST" ? { "content-type": "application/json" } : {}),
        ...(this.config.authToken ? { authorization: `Bearer ${this.config.authToken}` } : {}),
      },
      ...(this.config.method === "POST" ? {
        body: JSON.stringify({
          action: "siren",
          state,
          pulseMs: this.config.pulseMs,
          ...input,
        }),
      } : {}),
    });
    if (!response.ok) throw new Error(`physical_siren_${state}_failed:${response.status}`);
  }

  private remember(alertId: string) {
    this.triggeredAlertIds.add(alertId);
    if (this.triggeredAlertIds.size <= 1_000) return;
    const oldest = this.triggeredAlertIds.values().next().value as string | undefined;
    if (oldest) this.triggeredAlertIds.delete(oldest);
  }
}

export function physicalSirenTriggerFromPayload(payload: Record<string, unknown>): PhysicalSirenTrigger {
  const required = ["alertId", "branchId", "severity", "detectionType", "occurredAt"] as const;
  for (const key of required) {
    if (typeof payload[key] !== "string" || !payload[key].trim()) {
      throw new Error(`physical_siren_${key}_required`);
    }
  }
  return {
    alertId: payload.alertId as string,
    branchId: payload.branchId as string,
    severity: payload.severity as string,
    detectionType: payload.detectionType as string,
    occurredAt: payload.occurredAt as string,
  };
}
