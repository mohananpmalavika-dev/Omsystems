/**
 * Forensic Evidence Export REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { evidenceExportService } from '../services/evidence-export.service.js';
import { evidenceVerifier } from '../services/evidence-verifier.service.js';
import { chainOfCustodyService } from '../services/chain-of-custody.service.js';

export async function registerForensicEvidenceExportRoutes(app: FastifyInstance) {
  // 1. Create Sealed Forensic Evidence Package
  app.post('/v1/evidence/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      tenantId: z.string().default('BANK-001'),
      branchId: z.string(),
      branchName: z.string().optional(),
      caseNumber: z.string().min(2),
      reason: z.string().min(5),
      incidentId: z.string().optional(),
      cameraIds: z.array(z.string()).min(1),
      startTime: z.string(),
      endTime: z.string(),
      mode: z.enum(['STANDARD', 'FORENSIC']).default('FORENSIC'),
      operatorId: z.string().default('investigator-anand'),
      applyLegalHold: z.boolean().default(true),
    }).parse(request.body);

    const manifest = await evidenceExportService.exportEvidencePackage(body);
    return reply.status(201).send({ success: true, data: manifest });
  });

  // 2. List Sealed Evidence Packages
  app.get('/v1/evidence/packages', async (_request: FastifyRequest, reply: FastifyReply) => {
    const packages = evidenceExportService.listPackages();
    return reply.send({ success: true, data: packages });
  });

  // 3. Get Single Package Manifest
  app.get('/v1/evidence/packages/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const manifest = evidenceExportService.getPackage(params.id);
    if (!manifest) return reply.code(404).send({ success: false, error: 'EVIDENCE_PACKAGE_NOT_FOUND' });
    return reply.send({ success: true, data: manifest });
  });

  // 4. Verify Evidence Package (Signature, Hashes, Chain of Custody)
  app.post('/v1/evidence/packages/:id/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const manifest = evidenceExportService.getPackage(params.id);
    if (!manifest) return reply.code(404).send({ success: false, error: 'EVIDENCE_PACKAGE_NOT_FOUND' });

    const result = evidenceVerifier.verifyEvidencePackage(manifest);
    return reply.send({ success: true, data: result });
  });

  // 5. Append Chain of Custody Event
  app.post('/v1/evidence/packages/:id/custody', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({
      event: z.enum(['PACKAGE_DOWNLOADED', 'PACKAGE_SHARED', 'CUSTODY_TRANSFERRED']),
      actor: z.string(),
      recipient: z.string().optional(),
      reason: z.string().optional(),
    }).parse(request.body);

    const custodyEvent = chainOfCustodyService.appendEvent(params.id, {
      ...body,
      timestamp: new Date().toISOString(),
    });

    return reply.status(201).send({ success: true, data: custodyEvent });
  });

  // 6. Get Immutable Chain of Custody History
  app.get('/v1/evidence/packages/:id/chain-of-custody', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const chain = chainOfCustodyService.getChain(params.id);
    const verification = chainOfCustodyService.verifyChain(params.id);
    return reply.send({ success: true, data: { chain, verification } });
  });
}
