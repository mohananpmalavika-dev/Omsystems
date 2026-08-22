/**
 * Remote CCTV Infrastructure Operations REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { degradationDetector } from '../services/degradation-detector.service.js';
import { aiRootCause } from '../services/ai-root-cause.service.js';
import { autonomousRemediation } from '../services/autonomous-remediation.service.js';
import { surgicalDispatch } from '../services/surgical-dispatch.service.js';
import { fleetRoiCalculator } from '../services/fleet-roi-calculator.service.js';

export async function registerRemoteOpsRoutes(app: FastifyInstance) {
  // 1. Triage Incident (Detect -> RCA -> Auto-Remediate or Work Order)
  app.post('/v1/remote-ops/triage', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      branchId: z.string(),
      branchName: z.string().default('Branch'),
      branchCode: z.string().default('BR-01'),
      cameraId: z.string(),
      cameraName: z.string().default('Camera'),
      modelNumber: z.string().optional(),
      physicalLocationInBranch: z.string().optional(),
      fps: z.number().default(25),
      packetLossPct: z.number().default(0),
      bitrateKbps: z.number().default(2048),
      stalledSeconds: z.number().optional(),
      pingResponseMs: z.number().optional(),
      switchPortPoEVoltage: z.number().optional(),
      otherCamerasOnSameSwitchDown: z.boolean().optional(),
    }).parse(request.body);

    // 1. Detect Degradation
    const signal = degradationDetector.evaluateCameraStream(body.branchId, body.cameraId, {
      fps: body.fps,
      packetLossPct: body.packetLossPct,
      bitrateKbps: body.bitrateKbps,
      stalledSeconds: body.stalledSeconds,
    });

    if (!signal) {
      return reply.send({ success: true, message: 'Camera stream healthy. No triage action needed.' });
    }

    // 2. AI Root Cause Analysis
    const diagnosis = aiRootCause.diagnoseSignal(signal, body.cameraName, {
      pingResponseMs: body.pingResponseMs,
      switchPortPoEVoltage: body.switchPortPoEVoltage,
      otherCamerasOnSameSwitchDown: body.otherCamerasOnSameSwitchDown,
    });

    // 3. Autonomous Remediation or Surgical Work Order
    if (diagnosis.canRemediateRemotely) {
      const remediation = await autonomousRemediation.executeRemediation(diagnosis);
      fleetRoiCalculator.recordIncident(remediation.success, Math.round(remediation.executionDurationMs / 1000));

      return reply.send({
        success: true,
        resolvedRemotely: true,
        technicianVisitNeeded: false,
        diagnosis,
        remediation,
      });
    } else {
      const workOrder = surgicalDispatch.generateWorkOrder(diagnosis, {
        branchName: body.branchName,
        branchCode: body.branchCode,
        physicalLocationInBranch: body.physicalLocationInBranch,
        modelNumber: body.modelNumber,
      });
      fleetRoiCalculator.recordIncident(false, 0);

      return reply.send({
        success: true,
        resolvedRemotely: false,
        technicianVisitNeeded: true,
        diagnosis,
        workOrder,
      });
    }
  });

  // 2. List Surgical Work Orders
  app.get('/v1/remote-ops/work-orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { branchId?: string };
    const workOrders = surgicalDispatch.listWorkOrders(query.branchId);
    return reply.send({ success: true, data: workOrders });
  });

  // 3. Get Fleet ROI Analytics
  app.get('/v1/remote-ops/roi', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { branches?: string };
    const branches = query.branches ? parseInt(query.branches, 10) : 500;
    const metrics = fleetRoiCalculator.calculateMetrics(branches);
    return reply.send({ success: true, data: metrics });
  });
}
