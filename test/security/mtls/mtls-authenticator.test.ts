/**
 * Comprehensive Unit Test Suite for mTLS Authenticator Service
 * Verifies all security invariants of X.509 client certificate authentication:
 * - Genuine cryptographic X.509 parsing
 * - Pin registry verification and role enforcement
 * - Subject Alternative Name (SAN) verification
 * - CRL immediate revocation enforcement
 * - Expiration and validity window checks
 * - Malformed input handling
 * - Audit logging and telemetry metrics
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { MtlsAuthenticatorService } from "../../../src/security/mtls/mtls-authenticator.service.js";
import { InMemoryMtlsRepository } from "../../../src/database/mtls-repository.js";
import {
  generateTestCertificates,
  type GeneratedCertBundle,
} from "./test-cert-generator.js";

const WORK_DIR = join(process.cwd(), "test-scratch", `mtls-unit-${Date.now()}`);

describe("Mutual TLS (mTLS) Authenticator Service - Production Unit Tests", () => {
  let certs: GeneratedCertBundle;
  let mtls: MtlsAuthenticatorService;
  let repo: InMemoryMtlsRepository;

  beforeAll(() => {
    certs = generateTestCertificates(WORK_DIR);
  });

  afterAll(() => {
    try {
      rmSync(WORK_DIR, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    repo = new InMemoryMtlsRepository();
    mtls = new MtlsAuthenticatorService(repo);
  });

  it("Invariant 1: Correctly inspects and extracts genuine X.509 metadata without mock data", () => {
    const details = mtls.inspectCertificate(certs.clientCert);

    expect(details.fingerprint).toBe(certs.clientFingerprint);
    expect(details.subject).toContain("CN=edge-agent-01.internal");
    expect(details.issuer).toContain("CN=Sentinel-Root-CA");
    expect(details.sans).toContain("edge-agent-01.internal");
    expect(details.sans).toContain("localhost");
    expect(details.sans).toContain("127.0.0.1");
    expect(new Date(details.validTo).getTime()).toBeGreaterThan(Date.now());
  });

  it("Invariant 2: Pinned certificate with matching role and SANs validates successfully", async () => {
    // Pin certificate using async repository-backed method
    await mtls.pinCertificateAsync({
      nodeId: "edge-agent-blr-01",
      role: "EDGE_AGENT",
      certFingerprint: certs.clientFingerprint,
      allowedSans: ["edge-agent-01.internal", "127.0.0.1"],
      pinnedBy: "superadmin@sentinel.bank",
    });

    const result = mtls.validateClientCert(certs.clientCert, "EDGE_AGENT", {
      clientIp: "127.0.0.1",
      endpoint: "/v1/edge-agents/edge-agent-blr-01/heartbeat",
    });

    expect(result.valid).toBe(true);
    expect(result.nodeId).toBe("edge-agent-blr-01");
    expect(result.role).toBe("EDGE_AGENT");
    expect(result.fingerprint).toBe(certs.clientFingerprint);
    expect(result.rejectionReason).toBeUndefined();
  });

  it("Invariant 3: Rejects authentic certificate with unregistered fingerprint", () => {
    // Not pinned
    const result = mtls.validateClientCert(certs.clientCert, "EDGE_AGENT");

    expect(result.valid).toBe(false);
    expect(result.fingerprint).toBe(certs.clientFingerprint);
    expect(result.rejectionReason).toContain("not found in trusted pin registry");
  });

  it("Invariant 4: Revocation immediately and irrevocably blocks a previously trusted certificate", async () => {
    // Pin certificate
    await mtls.pinCertificateAsync({
      nodeId: "edge-agent-blr-01",
      role: "EDGE_AGENT",
      certFingerprint: certs.clientFingerprint,
      allowedSans: ["edge-agent-01.internal"],
    });

    expect(mtls.isRevoked(certs.clientFingerprint)).toBe(false);
    expect(mtls.validateClientCert(certs.clientCert, "EDGE_AGENT").valid).toBe(true);

    // Revoke certificate with reason
    await mtls.revokeCertificateAsync({
      fingerprint: certs.clientFingerprint,
      reason: "Compromised edge device physical tamper detected",
      revokedBy: "soc-analyst-09",
    });

    expect(mtls.isRevoked(certs.clientFingerprint)).toBe(true);

    // Subsequent validation MUST fail closed
    const postRevocation = mtls.validateClientCert(certs.clientCert, "EDGE_AGENT");
    expect(postRevocation.valid).toBe(false);
    expect(postRevocation.rejectionReason).toContain("revocation list");
  });

  it("Invariant 5: Rejects certificate when claimed role mismatches pinned role", async () => {
    // Pinned specifically as MEDIA_NODE
    await mtls.pinCertificateAsync({
      nodeId: "media-gw-01",
      role: "MEDIA_NODE",
      certFingerprint: certs.clientFingerprint,
      allowedSans: [],
    });

    // Validating against expectedRole EDGE_AGENT must fail
    const result = mtls.validateClientCert(certs.clientCert, "EDGE_AGENT");
    expect(result.valid).toBe(false);
    expect(result.nodeId).toBe("media-gw-01");
    expect(result.rejectionReason).toContain("Role mismatch: certificate is pinned as MEDIA_NODE, but request claims EDGE_AGENT");
  });

  it("Invariant 6: Rejects certificate when required SANs are missing", async () => {
    // Pin requires SAN 'vault-zone-secure.internal' which the cert doesn't have
    await mtls.pinCertificateAsync({
      nodeId: "edge-agent-blr-01",
      role: "EDGE_AGENT",
      certFingerprint: certs.clientFingerprint,
      allowedSans: ["edge-agent-01.internal", "vault-zone-secure.internal"],
    });

    const result = mtls.validateClientCert(certs.clientCert, "EDGE_AGENT");
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toContain("SAN mismatch");
  });

  it("Invariant 7: Strictly rejects expired client certificate", async () => {
    const { X509Certificate, createHash } = await import("node:crypto");
    const expiredCertObj = new X509Certificate(certs.expiredCert);
    const expiredFp = createHash("sha256").update(expiredCertObj.raw).digest("hex").toLowerCase();

    await mtls.pinCertificateAsync({
      nodeId: "expired-agent",
      role: "EDGE_AGENT",
      certFingerprint: expiredFp,
      allowedSans: [],
    });

    const result = mtls.validateClientCert(certs.expiredCert, "EDGE_AGENT");
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toContain("Certificate expired");
  });

  it("Invariant 8: Strictly rejects malformed or corrupted PEM certificate strings", () => {
    const corrupted = "-----BEGIN CERTIFICATE-----\nNOT_VALID_BASE64_CORRUPTED==\n-----END CERTIFICATE-----";
    const result = mtls.validateClientCert(corrupted, "EDGE_AGENT");
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toContain("Certificate parse error");
  });

  it("Invariant 9: pinCertificateFromPem parses and pins directly from PEM", async () => {
    const record = await mtls.pinCertificateFromPem(
      certs.clientCert,
      "edge-agent-auto-01",
      "EDGE_AGENT",
      "enrollment-worker",
    );

    expect(record.nodeId).toBe("edge-agent-auto-01");
    expect(record.role).toBe("EDGE_AGENT");
    expect(record.certFingerprint).toBe(certs.clientFingerprint);
    expect(record.allowedSans).toContain("edge-agent-01.internal");

    const result = mtls.validateClientCert(certs.clientCert, "EDGE_AGENT");
    expect(result.valid).toBe(true);
  });

  it("Invariant 10: Records immutable audit logs for both allowed and rejected authentications", async () => {
    // 1. Rejected attempt
    mtls.validateClientCert(certs.clientCert, "EDGE_AGENT", {
      clientIp: "10.14.0.99",
      endpoint: "/v1/edge-agents/unknown/telemetry",
    });

    // 2. Pin and Allowed attempt
    await mtls.pinCertificateFromPem(certs.clientCert, "edge-agent-audited", "EDGE_AGENT");
    mtls.validateClientCert(certs.clientCert, "EDGE_AGENT", {
      clientIp: "10.14.0.50",
      endpoint: "/v1/edge-agents/edge-agent-audited/heartbeat",
    });

    const logs = await mtls.getAuditLogs();
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const allowed = logs.find((l) => l.decision === "ALLOWED");
    expect(allowed).toBeDefined();
    expect(allowed?.nodeId).toBe("edge-agent-audited");
    expect(allowed?.clientIp).toBe("10.14.0.50");

    const rejected = logs.find((l) => l.decision === "REJECTED");
    expect(rejected).toBeDefined();
    expect(rejected?.clientIp).toBe("10.14.0.99");
    expect(rejected?.rejectionReason).toBeDefined();
  });

  it("Invariant 11: Repository metrics accurately reflect pinned, active, and revoked counts", async () => {
    await mtls.pinCertificateFromPem(certs.clientCert, "agent-1", "EDGE_AGENT");
    await mtls.pinCertificateFromPem(certs.wrongRoleCert, "media-1", "MEDIA_NODE");

    let metrics = await mtls.getMetrics();
    expect(metrics.totalPinned).toBe(2);
    expect(metrics.activePins).toBe(2);
    expect(metrics.totalRevoked).toBe(0);

    await mtls.revokeCertificateAsync({
      fingerprint: certs.clientFingerprint,
      reason: "Decommissioned",
      revokedBy: "admin",
    });

    metrics = await mtls.getMetrics();
    expect(metrics.totalPinned).toBe(2);
    expect(metrics.activePins).toBe(1);
    expect(metrics.totalRevoked).toBe(1);
  });
});
