import { timingSafeEqual } from "node:crypto";

export type AlertEvidenceKind = "snapshot" | "clip";

export interface AlertEvidenceCaptureStatus {
  alertId: string;
  cameraId: string;
  state: "queued" | "capturing" | "ready" | "partial" | "failed";
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  snapshotAvailable: boolean;
  clipAvailable: boolean;
  error?: string;
}

export interface AlertEvidenceClient {
  capture(input: {
    alertId: string;
    cameraId: string;
    occurredAt: string;
    clipSeconds: number;
  }): Promise<AlertEvidenceCaptureStatus>;
  status(alertId: string): Promise<Response>;
  asset(alertId: string, kind: AlertEvidenceKind, range?: string): Promise<Response>;
}

export class HttpAlertEvidenceClient implements AlertEvidenceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly sharedKey: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async capture(input: {
    alertId: string;
    cameraId: string;
    occurredAt: string;
    clipSeconds: number;
  }) {
    const response = await this.call(`/internal/alert-evidence/${encodeURIComponent(input.alertId)}/capture`, {
      method: "POST",
      body: JSON.stringify({
        cameraId: input.cameraId,
        occurredAt: input.occurredAt,
        clipSeconds: input.clipSeconds,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`alert_evidence_capture_rejected_${response.status}`);
    }
    return await response.json() as AlertEvidenceCaptureStatus;
  }

  status(alertId: string) {
    return this.call(`/internal/alert-evidence/${encodeURIComponent(alertId)}/status`, {
      signal: AbortSignal.timeout(5_000),
    });
  }

  asset(alertId: string, kind: AlertEvidenceKind, range?: string) {
    return this.call(`/internal/alert-evidence/${encodeURIComponent(alertId)}/${kind}`, {
      ...(range ? { headers: { range } } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  }

  private call(path: string, init: RequestInit) {
    return this.request(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        "x-recording-engine-key": this.sharedKey,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }
}

export function managedAlertEvidenceReferences(alertId: string) {
  const base = `/v1/alerts/${alertId}/evidence`;
  return { snapshotReference: `${base}/snapshot`, clipReference: `${base}/clip` };
}

export function isManagedAlertEvidenceReference(alertId: string, value: string | undefined) {
  if (!value) return false;
  const expected = managedAlertEvidenceReferences(alertId);
  return secureEqual(value, expected.snapshotReference) || secureEqual(value, expected.clipReference);
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
