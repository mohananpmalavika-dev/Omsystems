/**
 * Consolidated Notification Subsystem - REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  notificationService,
  notificationOutbox,
  notificationWorker,
  notificationAcknowledgementService,
} from "../notifications/index.js";
import { VoiceCallbackTokens } from "../alerts/voice-call.js";

const voiceTokens = new VoiceCallbackTokens(process.env.VOICE_TOKEN_SECRET || "sentinel-voice-secret-key-2026");

export async function registerNotificationRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/notifications/dispatch & /v1/notifications/dispatch
   */
  const handleDispatch = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.alertId || !body?.priority || !body?.title) {
      return reply.status(400).send({
        success: false,
        error: "Missing required alert fields: alertId, priority, title",
      });
    }

    const context = {
      tenantId: body.tenantId || "bank-corp",
      alertId: body.alertId,
      branchId: body.branchId,
      branchName: body.branchName,
      cameraId: body.cameraId,
      cameraName: body.cameraName,
      detectionType: body.detectionType,
      priority: body.priority,
      severity: body.severity || body.priority,
      title: body.title,
      message: body.message || body.title,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    };

    const jobs = await notificationService.notifyAlert(context, false);
    await notificationService.processOutbox();

    return reply.status(201).send({
      success: true,
      data: {
        alertId: context.alertId,
        enqueuedJobs: jobs.length,
        jobs,
      },
    });
  };

  app.post("/api/v1/notifications/dispatch", handleDispatch);
  app.post("/v1/notifications/dispatch", handleDispatch);

  /**
   * GET /api/v1/notifications/outbox & /v1/notifications/outbox
   */
  const handleGetOutbox = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const alertId = query?.alertId;

    const jobs = alertId
      ? notificationOutbox.getJobsByAlert(alertId)
      : notificationOutbox.getAllJobs(Number(query?.limit) || 100);

    return reply.send({
      success: true,
      data: {
        total: jobs.length,
        jobs,
      },
    });
  };

  app.get("/api/v1/notifications/outbox", handleGetOutbox);
  app.get("/v1/notifications/outbox", handleGetOutbox);

  /**
   * GET /api/v1/notifications/providers/health & /v1/notifications/providers/health
   */
  const handleProvidersHealth = async (request: FastifyRequest, reply: FastifyReply) => {
    const health = await notificationWorker.checkAllProviderHealth();
    return reply.send({
      success: true,
      data: {
        providers: health,
        checkedAt: new Date().toISOString(),
      },
    });
  };

  app.get("/api/v1/notifications/providers/health", handleProvidersHealth);
  app.get("/v1/notifications/providers/health", handleProvidersHealth);

  /**
   * POST /api/v1/notifications/acknowledge & /v1/notifications/acknowledge
   */
  const handleAcknowledge = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.alertId) {
      return reply.status(400).send({ success: false, error: "Missing alertId" });
    }

    const channel = body.channel || "DASHBOARD";
    const result = await notificationAcknowledgementService.acknowledgeFromChannel(
      body.alertId,
      channel,
      body.actorReference
    );

    return reply.send({
      success: true,
      data: result,
    });
  };

  app.post("/api/v1/notifications/acknowledge", handleAcknowledge);
  app.post("/v1/notifications/acknowledge", handleAcknowledge);

  /**
   * GET & POST /api/v1/notifications/voice/ivr & /v1/notifications/voice/ivr
   * Voice IVR webhook for Asterisk / Twilio / Exotel DTMF inputs
   */
  const handleVoiceIvr = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const token = query?.token;
    const claims = token ? voiceTokens.verify(token) : undefined;

    const digits = query?.Digits || (request.body as any)?.Digits;

    if (digits === "1") {
      // Press 1: Acknowledge alert and cancel pending escalation
      if (claims?.alertId) {
        await notificationAcknowledgementService.acknowledgeFromChannel(
          claims.alertId,
          "VOICE_IVR",
          query?.From || "Caller"
        );
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Alert acknowledged. Surveillance incident recorded. Goodbye.</Say>
  <Hangup/>
</Response>`;
      return reply.header("content-type", "text/xml").send(twiml);
    }

    if (digits === "2") {
      // Press 2: Replay prompt without generating new notification
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/api/v1/notifications/voice/ivr?token=${encodeURIComponent(token ?? "")}" method="GET" timeout="8">
    <Say>Repeating alert. Critical surveillance alert. Press 1 to acknowledge. Press 2 to repeat.</Say>
  </Gather>
  <Hangup/>
</Response>`;
      return reply.header("content-type", "text/xml").send(twiml);
    }

    // Default IVR prompt
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/api/v1/notifications/voice/ivr?token=${encodeURIComponent(token ?? "")}" method="GET" timeout="8">
    <Say>Critical surveillance alert. Press 1 to acknowledge. Press 2 to repeat.</Say>
  </Gather>
  <Hangup/>
</Response>`;
    return reply.header("content-type", "text/xml").send(twiml);
  };

  app.get("/api/v1/notifications/voice/ivr", handleVoiceIvr);
  app.post("/api/v1/notifications/voice/ivr", handleVoiceIvr);
  app.get("/v1/notifications/voice/ivr", handleVoiceIvr);
  app.post("/v1/notifications/voice/ivr", handleVoiceIvr);

  /**
   * GET /api/v1/notifications/dead-letters & /v1/notifications/dead-letters
   */
  const handleDeadLetters = async (request: FastifyRequest, reply: FastifyReply) => {
    const deadLetters = notificationOutbox.getDeadLetters();
    return reply.send({
      success: true,
      data: {
        total: deadLetters.length,
        deadLetters,
      },
    });
  };

  app.get("/api/v1/notifications/dead-letters", handleDeadLetters);
  app.get("/v1/notifications/dead-letters", handleDeadLetters);
}
