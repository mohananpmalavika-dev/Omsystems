import { createHmac, randomBytes } from "node:crypto";

export interface QrtIncidentPayload {
  incidentId: string;
  token: string;
  expiresAt: string;
  branchName: string;
  branchAddress: string;
  gpsCoordinates: { lat: number; lng: number };
  alertType: string;
  severity: "P1" | "P2" | "P3";
  liveStreamUrl: string;
  snapshotUrl?: string;
  assignedResponder?: string;
  status: "DISPATCHED" | "ACKNOWLEDGED_ON_SCENE" | "RESOLVED";
}

export class QrtDispatchService {
  private activeTokens = new Map<string, QrtIncidentPayload>();
  private readonly secretKey = process.env.QRT_SECRET_KEY || "sentinel-grid-qrt-incident-secret-2026";

  generateIncidentToken(incident: {
    incidentId: string;
    branchName: string;
    branchAddress?: string;
    gps?: { lat: number; lng: number };
    alertType: string;
    severity?: "P1" | "P2" | "P3";
    liveStreamUrl?: string;
    snapshotUrl?: string;
    ttlMinutes?: number;
  }): { token: string; dispatchUrl: string; expiresAt: string } {
    const token = randomBytes(16).toString("hex");
    const ttl = incident.ttlMinutes ?? 30; // 30 minutes active window
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

    const payload: QrtIncidentPayload = {
      incidentId: incident.incidentId,
      token,
      expiresAt,
      branchName: incident.branchName,
      branchAddress: incident.branchAddress || "Kochi Hub, Kerala 682001",
      gpsCoordinates: incident.gps || { lat: 9.9312, lng: 76.2673 },
      alertType: incident.alertType,
      severity: incident.severity || "P1",
      liveStreamUrl: incident.liveStreamUrl || `/api/live?channel=1`,
      snapshotUrl: incident.snapshotUrl,
      status: "DISPATCHED",
    };

    this.activeTokens.set(token, payload);

    const baseUrl = process.env.BASE_URL || "https://sentinel-grid-monitoring-vhid.onrender.com";
    const dispatchUrl = `${baseUrl}/live-incident/${token}`;

    return { token, dispatchUrl, expiresAt };
  }

  getIncidentByToken(token: string): QrtIncidentPayload | undefined {
    const payload = this.activeTokens.get(token);
    if (!payload) return undefined;

    if (new Date(payload.expiresAt).getTime() < Date.now()) {
      this.activeTokens.delete(token);
      return undefined;
    }

    return payload;
  }

  acknowledgeOnScene(token: string, responderName: string): boolean {
    const payload = this.getIncidentByToken(token);
    if (!payload) return false;

    payload.status = "ACKNOWLEDGED_ON_SCENE";
    payload.assignedResponder = responderName;
    return true;
  }
}
