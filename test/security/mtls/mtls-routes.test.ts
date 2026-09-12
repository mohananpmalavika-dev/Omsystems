/**
 * Integration Test Suite for mTLS Fastify Management Routes
 * Verifies REST API endpoints for certificate pinning, CRL management, and verification.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { buildApp } from "../../../src/app.js";
import { MemoryStore } from "../../../src/store.js";
import {
  generateTestCertificates,
  type GeneratedCertBundle,
} from "./test-cert-generator.js";

const WORK_DIR = join(process.cwd(), "test-scratch", `mtls-routes-${Date.now()}`);

describe("Mutual TLS (mTLS) Security Management API Tests", () => {
  let certs: GeneratedCertBundle;
  let app: any;

  beforeAll(async () => {
    certs = generateTestCertificates(WORK_DIR);
    const store = new MemoryStore();
    app = await buildApp({ store });
  });

  afterAll(async () => {
    if (app) await app.close();
    try {
      rmSync(WORK_DIR, { recursive: true, force: true });
    } catch {}
  });

  it("GET /v1/security/mtls/status returns system health and metrics", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/security/mtls/status",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe("HEALTHY");
    expect(json.metrics).toBeDefined();
    expect(json.enforcementMode).toBeDefined();
  });

  it("POST /v1/security/mtls/pins registers a new certificate from genuine X.509 PEM", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/security/mtls/pins",
      payload: {
        nodeId: "edge-agent-blr-01",
        role: "EDGE_AGENT",
        pemCert: certs.clientCert,
        pinnedBy: "sec-admin@sentinel.internal",
      },
    });

    expect(response.statusCode).toBe(201);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.data.nodeId).toBe("edge-agent-blr-01");
    expect(json.data.role).toBe("EDGE_AGENT");
    expect(json.data.certFingerprint).toBe(certs.clientFingerprint);
    expect(json.data.allowedSans).toContain("edge-agent-01.internal");
    expect(json.data.status).toBe("ACTIVE");
  });

  it("GET /v1/security/mtls/pins lists all registered trusted certificate pins", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/security/mtls/pins",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.count).toBeGreaterThanOrEqual(1);
    const pin = json.data.find((p: any) => p.certFingerprint === certs.clientFingerprint);
    expect(pin).toBeDefined();
    expect(pin.nodeId).toBe("edge-agent-blr-01");
  });

  it("POST /v1/security/mtls/validate verifies a valid client certificate against policy", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/security/mtls/validate",
      payload: {
        pemCert: certs.clientCert,
        expectedRole: "EDGE_AGENT",
        expectedSan: "edge-agent-01.internal",
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.valid).toBe(true);
    expect(json.nodeId).toBe("edge-agent-blr-01");
    expect(json.role).toBe("EDGE_AGENT");
    expect(json.fingerprint).toBe(certs.clientFingerprint);
  });

  it("POST /v1/security/mtls/validate fails with 403 when role mismatches", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/security/mtls/validate",
      payload: {
        pemCert: certs.clientCert,
        expectedRole: "MEDIA_NODE", // Mismatch with pinned EDGE_AGENT
      },
    });

    expect(response.statusCode).toBe(403);
    const json = response.json();
    expect(json.success).toBe(false);
    expect(json.valid).toBe(false);
    expect(json.rejectionReason).toContain("Role mismatch");
  });

  it("POST /v1/security/mtls/revoke adds certificate to CRL and revokes trust", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/security/mtls/revoke",
      payload: {
        fingerprint: certs.clientFingerprint,
        reason: "Hardware decommissioned and retired",
        revokedBy: "soc-admin",
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain("revoked");

    // Check list of revocations
    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/security/mtls/revocations",
    });
    expect(listResponse.statusCode).toBe(200);
    const listJson = listResponse.json();
    expect(listJson.count).toBeGreaterThanOrEqual(1);
    const found = listJson.data.find((r: any) => r.fingerprint === certs.clientFingerprint);
    expect(found).toBeDefined();
    expect(found.reason).toBe("Hardware decommissioned and retired");

    // Subsequent validate attempt MUST fail with 403
    const validateResponse = await app.inject({
      method: "POST",
      url: "/v1/security/mtls/validate",
      payload: {
        pemCert: certs.clientCert,
        expectedRole: "EDGE_AGENT",
      },
    });
    expect(validateResponse.statusCode).toBe(403);
    expect(validateResponse.json().rejectionReason).toContain("revocation list");
  });

  it("DELETE /v1/security/mtls/pins/:fingerprint removes a certificate pin", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/security/mtls/pins/${certs.clientFingerprint}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    // Pin should not be in list anymore
    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/security/mtls/pins",
    });
    const found = listResponse.json().data.find((p: any) => p.certFingerprint === certs.clientFingerprint);
    expect(found).toBeUndefined();
  });

  it("GET /v1/security/mtls/audit-logs returns immutable authentication history", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/security/mtls/audit-logs",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
  });
});
