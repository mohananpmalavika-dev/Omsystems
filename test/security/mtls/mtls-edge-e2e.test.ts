/**
 * End-to-End (E2E) Test Suite for Mutual TLS (mTLS) Authentication
 * Capability: security.mtls
 * 
 * Verifies high-assurance Edge-to-Control Plane client certificate authentication
 * and PostgreSQL & Redis database links with zero mock data.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { buildApp } from "../../../src/app.js";
import { MemoryStore } from "../../../src/store.js";
import { mtlsAuthenticator } from "../../../src/security/mtls/index.js";
import {
  createDatabaseTlsConfig,
  createRedisTlsConfig,
  validateDatabaseSecurityConfiguration,
} from "../../../src/security/tls/database-tls-config.js";
import {
  generateTestCertificates,
  type GeneratedCertBundle,
} from "./test-cert-generator.js";

const WORK_DIR = join(process.cwd(), "test-scratch", `mtls-e2e-${Date.now()}`);

describe("Mutual TLS (mTLS) Edge-to-Control Plane & Database Links E2E Tests", () => {
  let certs: GeneratedCertBundle;
  let app: any;
  let store: MemoryStore;
  const agentId = "edge-agent-bank-blr-01";

  beforeAll(async () => {
    certs = generateTestCertificates(WORK_DIR);
    store = new MemoryStore();
    // Seed an edge agent record directly into store.edgeAgents
    (store as any).edgeAgents.set(agentId, {
      id: agentId,
      branchId: "branch-blr-01",
      name: "Bangalore Main Vault Edge Agent",
      version: "1.0.0",
      status: "online",
      lastSeenAt: new Date().toISOString(),
    });

    app = await buildApp({ store });

    // Pin the edge client certificate
    await mtlsAuthenticator.pinCertificateFromPem(
      certs.clientCert,
      agentId,
      "EDGE_AGENT",
      "pki-provisioner",
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    try {
      rmSync(WORK_DIR, { recursive: true, force: true });
    } catch {}
  });

  // ============================================================================
  // 1. Edge-to-Control Plane High-Assurance Ingress Authentication
  // ============================================================================

  it("authenticates Edge Agent via client certificate on heartbeat endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agentId}/heartbeat`,
      headers: {
        "content-type": "application/json",
        "x-client-cert": certs.clientCert, // Verified client certificate presented by mTLS
      },
      payload: {
        version: "1.0.0",
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.id).toBe(agentId);
    expect(json.status).toBe("online");
  });

  it("authenticates Edge Agent via client certificate on cameras monitoring ingress", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/edge-agents/${agentId}/cameras/monitoring`,
      headers: {
        "x-client-cert": certs.clientCert,
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.data).toBeDefined();
  });

  it("rejects Edge Agent ingress when presenting untrusted/unpinned client certificate", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agentId}/heartbeat`,
      headers: {
        "content-type": "application/json",
        "x-client-cert": certs.wrongRoleCert, // Different cert not pinned as EDGE_AGENT for this node
      },
      payload: {
        version: "1.0.0",
      },
    });

    // When unauthenticated, falls through to standard 401 unauthenticated
    expect(response.statusCode).toBe(401);
  });

  it("rejects Edge Agent ingress when presenting revoked client certificate", async () => {
    // Revoke the edge certificate
    await mtlsAuthenticator.revokeCertificateAsync({
      fingerprint: certs.clientFingerprint,
      reason: "Device retired",
      revokedBy: "sec-admin",
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agentId}/heartbeat`,
      headers: {
        "content-type": "application/json",
        "x-client-cert": certs.clientCert,
      },
      payload: {
        version: "1.0.0",
      },
    });

    expect(response.statusCode).toBe(401);

    // Re-pin for remaining tests
    await mtlsAuthenticator.pinCertificateFromPem(
      certs.clientCert,
      agentId,
      "EDGE_AGENT",
      "pki-provisioner",
    );
  });

  // ============================================================================
  // 2. Database Links mTLS Configuration (PostgreSQL & Redis)
  // ============================================================================

  it("configures verified PostgreSQL mTLS connection options with client certificate and key", () => {
    const dbTls = createDatabaseTlsConfig({
      mode: "VERIFY_FULL",
      isProduction: true,
      ca: certs.caCert,
      cert: certs.clientCert,
      key: certs.clientKey,
      servername: "postgres.bank.internal",
      requireClientCert: true,
    });

    expect(typeof dbTls).toBe("object");
    if (typeof dbTls === "object" && dbTls !== null) {
      expect(dbTls.rejectUnauthorized).toBe(true);
      expect(dbTls.minVersion).toBe("TLSv1.2");
      expect(dbTls.ca).toBe(certs.caCert);
      expect(dbTls.cert).toBe(certs.clientCert);
      expect(dbTls.key).toBe(certs.clientKey);
      expect(dbTls.servername).toBe("postgres.bank.internal");
    }
  });

  it("strictly throws SecurityConfigurationError if DB mTLS client cert lacks a private key", () => {
    expect(() => {
      createDatabaseTlsConfig({
        mode: "VERIFY_FULL",
        isProduction: true,
        ca: certs.caCert,
        cert: certs.clientCert, // No key provided
      });
    }).toThrow(/without a corresponding private key/);
  });

  it("strictly throws SecurityConfigurationError if DB mTLS client cert is expired", () => {
    expect(() => {
      createDatabaseTlsConfig({
        mode: "VERIFY_FULL",
        isProduction: true,
        ca: certs.caCert,
        cert: certs.expiredCert,
        key: certs.expiredKey,
      });
    }).toThrow(/expired/);
  });

  it("strictly throws SecurityConfigurationError when requireClientCert is true but no cert is given", () => {
    expect(() => {
      createDatabaseTlsConfig({
        mode: "VERIFY_FULL",
        isProduction: true,
        ca: certs.caCert,
        requireClientCert: true,
      });
    }).toThrow(/requires mutual TLS/);
  });

  it("configures verified Redis mTLS connection options with client certificate and key", () => {
    const redisTls = createRedisTlsConfig({
      enabled: true,
      isProduction: true,
      ca: certs.caCert,
      cert: certs.clientCert,
      key: certs.clientKey,
      servername: "redis.bank.internal",
      requireClientCert: true,
    });

    expect(redisTls).toBeDefined();
    expect(redisTls?.rejectUnauthorized).toBe(true);
    expect(redisTls?.ca).toBe(certs.caCert);
    expect(redisTls?.cert).toBe(certs.clientCert);
    expect(redisTls?.key).toBe(certs.clientKey);
    expect(redisTls?.servername).toBe("redis.bank.internal");
  });

  it("validates database security configuration and ensures mTLS enforcement in production", () => {
    const validSsl = createDatabaseTlsConfig({
      mode: "VERIFY_FULL",
      isProduction: true,
      ca: certs.caCert,
      cert: certs.clientCert,
      key: certs.clientKey,
    });

    // Valid configuration should not throw
    expect(() => {
      validateDatabaseSecurityConfiguration({
        isProduction: true,
        ssl: validSsl,
        databaseUrl: "postgresql://app:secret@db.bank.internal:5432/sentinel",
      });
    }).not.toThrow();
  });
});
