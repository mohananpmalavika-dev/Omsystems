import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerEvidenceRoutes } from "../../src/routes/evidence.routes.js";
import { MemoryStore } from "../../src/store.js";
import { randomUUID } from "node:crypto";

describe("Cross-Tenant Isolation & Anti-Enumeration Hardening (P0-17, P0-18, P0-19)", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  const tenantAlphaHeaders = {
    "x-tenant-id": "tenant-alpha",
    "x-user-id": "user-alpha-officer",
  };

  const tenantBravoHeaders = {
    "x-tenant-id": "tenant-bravo",
    "x-user-id": "user-bravo-adversary",
  };

  const mockExportWorker = {
    createExportJob: async () => ({ id: "export-mock-1", status: "pending" }),
    listExportJobs: async () => [],
  };

  beforeEach(async () => {
    app = Fastify();
    store = new MemoryStore();

    // Attach current user identity based on request headers (simulating authenticated session)
    app.addHook("preHandler", async (request) => {
      const tenantId = request.headers["x-tenant-id"] as string | undefined;
      const userId = request.headers["x-user-id"] as string | undefined;
      if (tenantId && userId) {
        (request as any).currentUser = {
          id: userId,
          tenantId,
          role: "company_admin",
          roles: ["company_admin"],
          permissions: ["*"],
          name: `User ${userId}`,
          email: `${userId}@${tenantId}.internal`,
        };
      }
    });

    await registerEvidenceRoutes(app, store, mockExportWorker as any);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("strictly isolates evidence cases and enforces 404 anti-enumeration on cross-tenant access", async () => {
    // 1. Tenant Alpha creates an evidence case
    const createCaseResp = await app.inject({
      method: "POST",
      url: "/v1/evidence/cases",
      headers: tenantAlphaHeaders,
      payload: {
        caseNumber: "ALPHA-2026-001",
        title: "Confidential Alpha Investigation",
        description: "Strictly confidential incident data",
      },
    });

    expect(createCaseResp.statusCode).toBe(200);
    const alphaCase = JSON.parse(createCaseResp.body);
    const caseId = alphaCase.id;
    expect(caseId).toBeDefined();
    expect(alphaCase.tenantId).toBe("tenant-alpha");

    // 2. Tenant Alpha successfully retrieves own case
    const getAlphaCaseResp = await app.inject({
      method: "GET",
      url: `/v1/evidence/cases/${caseId}`,
      headers: tenantAlphaHeaders,
    });
    expect(getAlphaCaseResp.statusCode).toBe(200);
    expect(JSON.parse(getAlphaCaseResp.body).title).toBe("Confidential Alpha Investigation");

    // 3. Tenant Alpha adds an evidence item
    const addItemResp = await app.inject({
      method: "POST",
      url: `/v1/evidence/cases/${caseId}/items`,
      headers: tenantAlphaHeaders,
      payload: {
        type: "document",
        description: "Financial ledger photocopy",
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        fileSize: 4096,
      },
    });
    expect(addItemResp.statusCode).toBe(200);

    // 4. Tenant Alpha lists items
    const listItemsResp = await app.inject({
      method: "GET",
      url: `/v1/evidence/cases/${caseId}/items`,
      headers: tenantAlphaHeaders,
    });
    expect(listItemsResp.statusCode).toBe(200);
    expect(JSON.parse(listItemsResp.body).data).toHaveLength(1);

    // 5. Tenant Alpha retrieves custody chain
    const custodyResp = await app.inject({
      method: "GET",
      url: `/v1/evidence/cases/${caseId}/chain-of-custody`,
      headers: tenantAlphaHeaders,
    });
    expect(custodyResp.statusCode).toBe(200);
    expect(JSON.parse(custodyResp.body).data.length).toBeGreaterThanOrEqual(2);

    // ========================================================================
    // CROSS-TENANT ADVERSARIAL ATTACK MATRIX (Tenant Bravo against Tenant Alpha)
    // ========================================================================

    // 6. Tenant Bravo attempts to GET Tenant Alpha's case -> Must return 404, NOT 200 or 403
    const bravoGetCaseResp = await app.inject({
      method: "GET",
      url: `/v1/evidence/cases/${caseId}`,
      headers: tenantBravoHeaders,
    });
    expect(bravoGetCaseResp.statusCode).toBe(404);
    expect(JSON.parse(bravoGetCaseResp.body).error).toBe("case_not_found");

    // 7. Tenant Bravo attempts to list items of Tenant Alpha's case -> 404
    const bravoListItemsResp = await app.inject({
      method: "GET",
      url: `/v1/evidence/cases/${caseId}/items`,
      headers: tenantBravoHeaders,
    });
    expect(bravoListItemsResp.statusCode).toBe(404);
    expect(JSON.parse(bravoListItemsResp.body).error).toBe("case_not_found");

    // 8. Tenant Bravo attempts to add item into Tenant Alpha's case -> 404
    const bravoAddItemResp = await app.inject({
      method: "POST",
      url: `/v1/evidence/cases/${caseId}/items`,
      headers: tenantBravoHeaders,
      payload: {
        type: "document",
        description: "Injected counterfeit document",
      },
    });
    expect(bravoAddItemResp.statusCode).toBe(404);
    expect(JSON.parse(bravoAddItemResp.body).error).toBe("case_not_found");

    // 9. Tenant Bravo attempts to read custody chain of Tenant Alpha's case -> 404
    const bravoCustodyResp = await app.inject({
      method: "GET",
      url: `/v1/evidence/cases/${caseId}/chain-of-custody`,
      headers: tenantBravoHeaders,
    });
    expect(bravoCustodyResp.statusCode).toBe(404);
    expect(JSON.parse(bravoCustodyResp.body).error).toBe("case_not_found");

    // 10. Tenant Bravo attempts to request export on Tenant Alpha's case -> 404
    const bravoExportReqResp = await app.inject({
      method: "POST",
      url: `/v1/evidence/cases/${caseId}/exports`,
      headers: tenantBravoHeaders,
      payload: {
        format: "mp4",
        reason: "Unauthorized exfiltration attempt",
      },
    });
    expect(bravoExportReqResp.statusCode).toBe(404);
    expect(JSON.parse(bravoExportReqResp.body).error).toBe("case_not_found");
  });

  it("strictly isolates evidence export retrieval across tenants", async () => {
    // 1. Tenant Alpha creates an export directly in the store
    const exportId = randomUUID();
    (store as any).evidenceExports.push({
      id: exportId,
      caseId: "case-alpha-99",
      tenantId: "tenant-alpha",
      format: "mp4",
      status: "ready",
      createdAt: new Date().toISOString(),
    });

    // Tenant Alpha can view export status
    const alphaGetExport = await app.inject({
      method: "GET",
      url: `/v1/evidence/exports/${exportId}`,
      headers: tenantAlphaHeaders,
    });
    expect(alphaGetExport.statusCode).toBe(200);

    // Tenant Bravo attempts to view Tenant Alpha's export -> 404 (Anti-Enumeration)
    const bravoGetExport = await app.inject({
      method: "GET",
      url: `/v1/evidence/exports/${exportId}`,
      headers: tenantBravoHeaders,
    });
    expect(bravoGetExport.statusCode).toBe(404);
    expect(JSON.parse(bravoGetExport.body).error).toBe("export_not_found");
  });

  it("strictly isolates legal holds across tenants", async () => {
    const cameraId = randomUUID();
    const branchId = "branch-alpha-1";

    // Seed camera and branch for Tenant Alpha
    (store as any).cameras.set(cameraId, {
      id: cameraId,
      tenantId: "tenant-alpha",
      nodeId: branchId,
      name: "Alpha Vault Camera",
    });
    (store as any).nodes.set(branchId, {
      id: branchId,
      tenantId: "tenant-alpha",
      type: "branch",
      name: "Alpha Branch",
    });

    const startTime = new Date("2026-09-07T00:00:00Z").toISOString();
    const endTime = new Date("2026-09-07T06:00:00Z").toISOString();

    // 1. Tenant Alpha creates a legal hold
    const createHoldResp = await app.inject({
      method: "POST",
      url: "/v1/evidence/legal-holds",
      headers: tenantAlphaHeaders,
      payload: {
        caseNumber: "ALPHA-HOLD-001",
        reason: "Securities regulatory hold",
        cameraIds: [cameraId],
        startTime,
        endTime,
      },
    });
    expect(createHoldResp.statusCode).toBe(200);
    const holdId = JSON.parse(createHoldResp.body).id;
    expect(holdId).toBeDefined();

    // 2. Tenant Bravo attempts to release Tenant Alpha's hold -> 404 (Anti-Enumeration)
    const bravoReleaseHold = await app.inject({
      method: "POST",
      url: `/v1/evidence/legal-holds/${holdId}/release`,
      headers: tenantBravoHeaders,
      payload: {
        reason: "Unauthorized adversary release attempt",
      },
    });
    expect(bravoReleaseHold.statusCode).toBe(404);
    expect(JSON.parse(bravoReleaseHold.body).error).toBe("hold_not_found");

    // 3. Tenant Alpha successfully releases own hold -> 200 OK
    const alphaReleaseHold = await app.inject({
      method: "POST",
      url: `/v1/evidence/legal-holds/${holdId}/release`,
      headers: tenantAlphaHeaders,
      payload: {
        reason: "Investigation completed, authorized hold release",
      },
    });
    expect(alphaReleaseHold.statusCode).toBe(200);
    expect(JSON.parse(alphaReleaseHold.body).releasedBy).toBe("user-alpha-officer");
  });
});
