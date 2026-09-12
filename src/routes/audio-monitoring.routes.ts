/**
 * Fastify REST & Server-Sent Events (SSE) Routes for Audio Stream Monitoring
 * Capability ID: video.audio
 * 
 * Provides production endpoints for real-time acoustic level metering,
 * camera audio decoding, threshold configurations, historical rollups,
 * and security acoustic alerts with zero mock data.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { AudioMonitoringService } from '../media/audio/audio-monitoring-service.js';
import type { AudioCodec } from '../media/audio/types.js';

export async function registerAudioMonitoringRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  customService?: AudioMonitoringService
) {
  const pool = (store as any).pool || (store as any).db;
  const audioService = customService || new AudioMonitoringService(store, pool);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user || (req as any).currentUser;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user || (req as any).currentUser;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. List Audio-Capable Channels
  app.get('/v1/audio-monitoring/channels', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const channels = await audioService.listChannels(tenantId);
      return reply.send({
        success: true,
        data: channels,
        count: channels.length,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to list audio monitoring channels');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to list audio monitoring channels',
      });
    }
  });

  // 2. Get Single Camera Audio Channel
  app.get('/v1/audio-monitoring/channels/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const { cameraId } = request.params;
      const tenantId = getTenantId(request);
      const channel = await audioService.getChannel(cameraId, tenantId);

      if (!channel) {
        return reply.status(404).send({
          success: false,
          error: 'Camera audio channel not found',
        });
      }

      return reply.send({
        success: true,
        data: channel,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get camera audio channel');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to get camera audio channel',
      });
    }
  });

  // 3. Update Audio Channel Configuration
  const updateConfigSchema = z.object({
    isEnabled: z.boolean().optional(),
    codec: z.enum(['PCMU', 'PCMA', 'PCM_S16LE', 'PCM_S16BE', 'PCM_U8', 'PCM_S24LE', 'PCM_F32LE', 'AAC_ADTS', 'OPUS']).optional(),
    sampleRateHz: z.number().int().min(4000).max(96000).optional(),
    channels: z.number().int().min(1).max(8).optional(),
    gainDb: z.number().min(-30).max(30).optional(),
    silenceThresholdDbFS: z.number().min(-90).max(-20).optional(),
    silenceTimeoutSec: z.number().int().min(1).max(300).optional(),
    noiseThresholdDbFS: z.number().min(-50).max(0).optional(),
    noiseTriggerDurationMs: z.number().int().min(50).max(5000).optional(),
    screamDetectionEnabled: z.boolean().optional(),
    spikeSensitivity: z.number().min(0).max(1).optional(),
    clippingAlertEnabled: z.boolean().optional(),
  });

  app.put('/v1/audio-monitoring/channels/:cameraId/config', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const { cameraId } = request.params;
      const tenantId = getTenantId(request);
      const body = updateConfigSchema.parse(request.body);

      const updated = await audioService.updateConfig(cameraId, body, tenantId);
      return reply.send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to update audio channel configuration');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to update audio channel configuration',
      });
    }
  });

  // 4. Decode Raw Audio and Compute Real-Time Meter Values
  const decodeSchema = z.object({
    payloadBase64: z.string().min(1),
    codec: z.enum(['PCMU', 'PCMA', 'PCM_S16LE', 'PCM_S16BE', 'PCM_U8', 'PCM_S24LE', 'PCM_F32LE', 'AAC_ADTS', 'OPUS']).optional(),
  });

  app.post('/v1/audio-monitoring/channels/:cameraId/decode-and-meter', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const { cameraId } = request.params;
      const tenantId = getTenantId(request);
      const body = decodeSchema.parse(request.body);

      const buffer = Buffer.from(body.payloadBase64, 'base64');
      const result = await audioService.decodeAndMeter(
        cameraId,
        new Uint8Array(buffer),
        body.codec as AudioCodec,
        tenantId
      );

      return reply.send({
        success: true,
        data: result.metrics,
        alerts: result.alerts,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to decode and meter audio');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to decode and meter audio',
      });
    }
  });

  // 5. Ingest Precomputed Audio Telemetry
  const telemetrySchema = z.object({
    rmsDbFS: z.number(),
    peakDbFS: z.number(),
    peakHoldDbFS: z.number().optional(),
    lufs: z.number().optional(),
    crestFactorDb: z.number().optional(),
    noiseFloorDbFS: z.number().optional(),
    snrDb: z.number().optional(),
    clippedSamples: z.number().int().optional(),
    clipPercentage: z.number().optional(),
    isClipping: z.boolean().optional(),
    vadState: z.enum(['SILENCE', 'SPEECH_ACTIVITY', 'HIGH_NOISE_ALERT', 'CLIPPED']).optional(),
    frequencyBands: z.object({
      low: z.number(),
      mid: z.number(),
      high: z.number(),
    }).optional(),
    waveform: z.array(z.number()).optional(),
    timestamp: z.string().optional(),
  });

  app.post('/v1/audio-monitoring/channels/:cameraId/telemetry', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const { cameraId } = request.params;
      const tenantId = getTenantId(request);
      const body = telemetrySchema.parse(request.body);

      const fullMetrics = {
        rmsDbFS: body.rmsDbFS,
        peakDbFS: body.peakDbFS,
        peakHoldDbFS: body.peakHoldDbFS ?? body.peakDbFS,
        lufs: body.lufs ?? body.rmsDbFS,
        crestFactorDb: body.crestFactorDb ?? Math.max(0, body.peakDbFS - body.rmsDbFS),
        noiseFloorDbFS: body.noiseFloorDbFS ?? -70.0,
        snrDb: body.snrDb ?? Math.max(0, body.rmsDbFS - (body.noiseFloorDbFS ?? -70.0)),
        clippedSamples: body.clippedSamples ?? 0,
        clipPercentage: body.clipPercentage ?? 0.0,
        isClipping: body.isClipping ?? false,
        vadState: body.vadState ?? 'SILENCE',
        frequencyBands: body.frequencyBands ?? { low: 33.3, mid: 33.3, high: 33.4 },
        waveform: body.waveform ?? new Array(48).fill(0),
        timestamp: body.timestamp ?? new Date().toISOString(),
      };

      const result = await audioService.ingestTelemetry(cameraId, fullMetrics, tenantId);
      return reply.send({
        success: true,
        alerts: result.alerts,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to ingest audio telemetry');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to ingest audio telemetry',
      });
    }
  });

  // 6. Query Historical Telemetry Rollups
  const historyQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(60),
  });

  app.get('/v1/audio-monitoring/channels/:cameraId/metrics/history', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const { cameraId } = request.params;
      const query = historyQuerySchema.parse(request.query);
      const history = await audioService.getTelemetryHistory(cameraId, query.limit);

      return reply.send({
        success: true,
        data: history,
        count: history.length,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to query telemetry history');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to query telemetry history',
      });
    }
  });

  // 7. Server-Sent Events (SSE) Real-Time Level Metering Stream
  app.get('/v1/audio-monitoring/channels/:cameraId/stream', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    const { cameraId } = request.params;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders?.();

    // Send initial snapshot
    const initial = await audioService.getChannel(cameraId);
    if (initial) {
      reply.raw.write(`event: initial\ndata: ${JSON.stringify(initial.currentMetrics)}\n\n`);
    }

    const unsubscribe = audioService.subscribeToStream(cameraId, (metrics) => {
      try {
        reply.raw.write(`event: meter\ndata: ${JSON.stringify(metrics)}\n\n`);
      } catch (err) {
        // Socket closed
      }
    });

    const pingInterval = setInterval(() => {
      try {
        reply.raw.write(`event: ping\ndata: {}\n\n`);
      } catch (err) {
        clearInterval(pingInterval);
      }
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(pingInterval);
      unsubscribe();
    });
  });

  // 8. List Acoustic Alerts
  const listAlertsQuerySchema = z.object({
    cameraId: z.string().optional(),
    status: z.enum(['detected', 'acknowledged', 'resolved', 'false_positive']).optional(),
    alertType: z.enum(['audio_loss', 'high_noise_threshold', 'acoustic_spike', 'scream_distress', 'clipping_distortion']).optional(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/audio-monitoring/alerts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listAlertsQuerySchema.parse(request.query);

      const result = await audioService.listAlerts({
        tenantId,
        cameraId: query.cameraId,
        status: query.status,
        alertType: query.alertType,
        severity: query.severity,
        limit: query.limit,
        offset: query.offset,
      });

      return reply.send({
        success: true,
        data: result.alerts,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to list audio alerts');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to list audio alerts',
      });
    }
  });

  // 9. Acknowledge Alert
  const ackSchema = z.object({
    notes: z.string().optional(),
  });

  app.post('/v1/audio-monitoring/alerts/:id/acknowledge', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const userId = getUserId(request);
      const body = ackSchema.parse(request.body || {});

      const updated = await audioService.acknowledgeAlert(id, userId, body.notes);
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Alert not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to acknowledge alert');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to acknowledge alert',
      });
    }
  });

  // 10. Aggregate Fleet Statistics
  app.get('/v1/audio-monitoring/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const stats = await audioService.getFleetStats(tenantId);
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get audio monitoring stats');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to get audio monitoring stats',
      });
    }
  });

  return audioService;
}
