/**
 * Control Room Alert Audio Subsystem - REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

interface AudioAuditRecord {
  id: string;
  userId: string;
  workstationId?: string;
  action: string;
  severityTested?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const auditLogStore: AudioAuditRecord[] = [];

export async function registerAlertAudioRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/alerts/audio/audit & /v1/alerts/audio/audit
   */
  const handleAudioAudit = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AudioAuditRecord;
    const record: AudioAuditRecord = {
      id: body.id || `aud-${Date.now()}`,
      userId: body.userId || "operator",
      workstationId: body.workstationId || "HO-Console-01",
      action: body.action || "AUDIO_TESTED",
      severityTested: body.severityTested,
      timestamp: body.timestamp || new Date().toISOString(),
      metadata: body.metadata,
    };

    auditLogStore.unshift(record);
    if (auditLogStore.length > 500) {
      auditLogStore.pop();
    }

    return reply.status(201).send({
      success: true,
      data: record,
    });
  };

  app.post("/api/v1/alerts/audio/audit", handleAudioAudit);
  app.post("/v1/alerts/audio/audit", handleAudioAudit);

  /**
   * GET /api/v1/alerts/audio/status & /v1/alerts/audio/status
   */
  const handleAudioStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const consoles = [
      {
        consoleId: "HO-01",
        operator: "OP-101 (Chief Controller)",
        status: "ONLINE",
        audioState: "READY",
        volume: 0.9,
        outputDevice: "Control Room Speaker 1",
        lastTestedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      },
      {
        consoleId: "HO-02",
        operator: "OP-104 (Surveillance Desk)",
        status: "ONLINE",
        audioState: "READY",
        volume: 0.85,
        outputDevice: "Control Room Speaker 2",
        lastTestedAt: new Date(Date.now() - 42 * 60_000).toISOString(),
      },
      {
        consoleId: "HO-03",
        operator: "OP-108 (Investigator)",
        status: "ONLINE",
        audioState: "MUTED",
        volume: 0.5,
        outputDevice: "Headset",
        lastTestedAt: new Date(Date.now() - 120 * 60_000).toISOString(),
      },
      {
        consoleId: "HO-04",
        operator: "OP-112 (Night Supervisor)",
        status: "ONLINE",
        audioState: "LOCKED",
        volume: 0.0,
        outputDevice: "Default",
        lastTestedAt: undefined,
      },
    ];

    return reply.send({
      success: true,
      data: {
        consoles,
        recentAudits: auditLogStore.slice(0, 20),
      },
    });
  };

  app.get("/api/v1/alerts/audio/status", handleAudioStatus);
  app.get("/v1/alerts/audio/status", handleAudioStatus);
}
