/**
 * Comprehensive Test Suite for Attribute-Based Access Control (ABAC - security.abac)
 * Tests contextual access rules based on time of day, network subnet, and user clearance tags.
 * Validates zero mock data semantics, database repository persistence, and Fastify REST API.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import {
  AbacService,
  ipMatchesCidr,
  evaluateSubnetAccess,
  isInternalIp,
  normalizeIp,
  evaluateTimeAccess,
  getLocalTimeDetails,
  evaluateClearanceAccess,
  CLEARANCE_RANKS,
} from "../../src/security/abac/index.js";
import { InMemoryAbacRepository } from "../../src/database/abac-repository.js";
import { registerAbacRoutes } from "../../src/routes/abac.routes.js";
import { AbacPolicyEngine } from "../../src/security/authorization/abac-policy-engine.js";

describe("Attribute-Based Access Control (ABAC - security.abac)", () => {
  // ============================================================================
  // 1. NETWORK SUBNET & CIDR MATCHING
  // ============================================================================
  describe("Network Subnet (IPv4 & IPv6 CIDR) Matcher", () => {
    it("matches IPv4 addresses within standard CIDR blocks", () => {
      // /8 Class A
      expect(ipMatchesCidr("10.5.20.1", "10.0.0.0/8")).toBe(true);
      expect(ipMatchesCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);

      // /16 Class B
      expect(ipMatchesCidr("172.16.5.99", "172.16.0.0/16")).toBe(true);
      expect(ipMatchesCidr("172.17.0.1", "172.16.0.0/16")).toBe(false);

      // /24 Class C
      expect(ipMatchesCidr("192.168.1.100", "192.168.1.0/24")).toBe(true);
      expect(ipMatchesCidr("192.168.2.1", "192.168.1.0/24")).toBe(false);

      // /32 Exact Host
      expect(ipMatchesCidr("192.168.1.50", "192.168.1.50/32")).toBe(true);
      expect(ipMatchesCidr("192.168.1.51", "192.168.1.50/32")).toBe(false);
    });

    it("normalizes IPv4-mapped IPv6 and localhost loopback", () => {
      expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
      expect(normalizeIp("::1")).toBe("127.0.0.1");
      expect(ipMatchesCidr("::ffff:10.1.2.3", "10.0.0.0/8")).toBe(true);
      expect(ipMatchesCidr("::1", "127.0.0.0/8")).toBe(true);
    });

    it("matches IPv6 addresses within CIDR blocks", () => {
      // 2001:db8::/32
      expect(ipMatchesCidr("2001:db8:0:0:0:0:0:1", "2001:db8::/32")).toBe(true);
      expect(ipMatchesCidr("2001:db8:ffff::1", "2001:db8::/32")).toBe(true);
      expect(ipMatchesCidr("2001:db9::1", "2001:db8::/32")).toBe(false);

      // fe80::/10 link-local
      expect(ipMatchesCidr("fe80::1", "fe80::/10")).toBe(true);
      expect(ipMatchesCidr("fec0::1", "fe80::/10")).toBe(false);
    });

    it("enforces explicit deny subnets over allowed subnets", () => {
      const allowed = ["10.0.0.0/8"];
      const denied = ["10.50.0.0/16"]; // untrusted branch or visitor subnet

      // Allowed host
      const res1 = evaluateSubnetAccess("10.1.1.5", allowed, denied);
      expect(res1.allowed).toBe(true);
      expect(res1.matchedAllowed).toBe("10.0.0.0/8");

      // Denied host within allowed block
      const res2 = evaluateSubnetAccess("10.50.1.99", allowed, denied);
      expect(res2.allowed).toBe(false);
      expect(res2.matchedDenied).toBe("10.50.0.0/16");
      expect(res2.reason).toContain("explicitly denied");

      // Host outside both
      const res3 = evaluateSubnetAccess("192.168.1.1", allowed, denied);
      expect(res3.allowed).toBe(false);
    });

    it("identifies corporate internal IP ranges (RFC 1918 / RFC 4193)", () => {
      expect(isInternalIp("10.200.1.1")).toBe(true);
      expect(isInternalIp("172.20.0.5")).toBe(true);
      expect(isInternalIp("192.168.10.50")).toBe(true);
      expect(isInternalIp("127.0.0.1")).toBe(true);
      expect(isInternalIp("8.8.8.8")).toBe(false);
      expect(isInternalIp("1.1.1.1")).toBe(false);
    });
  });

  // ============================================================================
  // 2. TIME OF DAY & SHIFT CONTEXTUAL EVALUATION
  // ============================================================================
  describe("Time of Day & Shift Window Evaluator", () => {
    it("evaluates standard daytime shift windows", () => {
      const rule = { startTime: "09:00", endTime: "18:00", timezone: "UTC" };

      // 12:30 UTC -> Allowed
      const date1 = new Date("2026-09-12T12:30:00Z");
      const res1 = evaluateTimeAccess(date1, rule);
      expect(res1.passed).toBe(true);

      // 08:30 UTC -> Denied (before shift)
      const date2 = new Date("2026-09-12T08:30:00Z");
      const res2 = evaluateTimeAccess(date2, rule);
      expect(res2.passed).toBe(false);
      expect(res2.reason).toContain("outside allowed window");

      // 18:30 UTC -> Denied (after shift)
      const date3 = new Date("2026-09-12T18:30:00Z");
      const res3 = evaluateTimeAccess(date3, rule);
      expect(res3.passed).toBe(false);
    });

    it("evaluates overnight shift windows crossing midnight", () => {
      // Shift: 22:00 -> 06:00
      const rule = { startTime: "22:00", endTime: "06:00", timezone: "UTC" };

      // 23:30 UTC -> In window
      const res1 = evaluateTimeAccess(new Date("2026-09-12T23:30:00Z"), rule);
      expect(res1.passed).toBe(true);

      // 04:15 UTC -> In window
      const res2 = evaluateTimeAccess(new Date("2026-09-12T04:15:00Z"), rule);
      expect(res2.passed).toBe(true);

      // 14:00 UTC -> Out of window
      const res3 = evaluateTimeAccess(new Date("2026-09-12T14:00:00Z"), rule);
      expect(res3.passed).toBe(false);
      expect(res3.reason).toContain("outside allowed window");
    });

    it("converts UTC time to target timezone (e.g. Asia/Kolkata +05:30)", () => {
      // 09:00 to 18:00 in Asia/Kolkata
      const rule = { startTime: "09:00", endTime: "18:00", timezone: "Asia/Kolkata" };

      // 05:00 UTC = 10:30 IST -> In window
      const res1 = evaluateTimeAccess(new Date("2026-09-12T05:00:00Z"), rule);
      expect(res1.passed).toBe(true);

      // 02:00 UTC = 07:30 IST -> Out of window (before 09:00 IST)
      const res2 = evaluateTimeAccess(new Date("2026-09-12T02:00:00Z"), rule);
      expect(res2.passed).toBe(false);
    });

    it("evaluates day-of-week scheduling", () => {
      // Monday through Friday only (1 to 5)
      const rule = {
        startTime: "00:00",
        endTime: "23:59",
        timezone: "UTC",
        daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      };

      // 2026-09-11 is a Friday
      const friday = new Date("2026-09-11T10:00:00Z");
      expect(evaluateTimeAccess(friday, rule).passed).toBe(true);

      // 2026-09-13 is a Sunday
      const sunday = new Date("2026-09-13T10:00:00Z");
      const sunRes = evaluateTimeAccess(sunday, rule);
      expect(sunRes.passed).toBe(false);
      expect(sunRes.reason).toContain("outside allowed days");
    });
  });

  // ============================================================================
  // 3. USER CLEARANCE LEVEL & TAGS EVALUATION
  // ============================================================================
  describe("User Clearance Tags & Clearance Level Evaluator", () => {
    it("enforces hierarchical clearance ranks", () => {
      expect(CLEARANCE_RANKS.UNCLASSIFIED).toBeLessThan(CLEARANCE_RANKS.RESTRICTED);
      expect(CLEARANCE_RANKS.RESTRICTED).toBeLessThan(CLEARANCE_RANKS.CONFIDENTIAL);
      expect(CLEARANCE_RANKS.CONFIDENTIAL).toBeLessThan(CLEARANCE_RANKS.SECRET);
      expect(CLEARANCE_RANKS.SECRET).toBeLessThan(CLEARANCE_RANKS.TOP_SECRET);

      const secretUser = {
        clearanceLevel: "SECRET" as const,
        clearanceTags: ["GENERAL_OPS"],
        revoked: false,
      };

      // Can access CONFIDENTIAL
      expect(
        evaluateClearanceAccess(secretUser, { minClearanceLevel: "CONFIDENTIAL" }).passed,
      ).toBe(true);

      // Can access SECRET
      expect(
        evaluateClearanceAccess(secretUser, { minClearanceLevel: "SECRET" }).passed,
      ).toBe(true);

      // Cannot access TOP_SECRET
      const topSecRes = evaluateClearanceAccess(secretUser, { minClearanceLevel: "TOP_SECRET" });
      expect(topSecRes.passed).toBe(false);
      expect(topSecRes.reason).toContain("Insufficient clearance level");
    });

    it("enforces required clearance tags in ALL and ANY mode", () => {
      const user = {
        clearanceLevel: "SECRET" as const,
        clearanceTags: ["VAULT_ACCESS", "CASH_AREA"],
        revoked: false,
      };

      // ALL mode: has both -> allowed
      expect(
        evaluateClearanceAccess(user, {
          requiredClearanceTags: ["VAULT_ACCESS", "CASH_AREA"],
          matchMode: "ALL",
        }).passed,
      ).toBe(true);

      // ALL mode: missing SERVER_ROOM -> denied
      const allRes = evaluateClearanceAccess(user, {
        requiredClearanceTags: ["VAULT_ACCESS", "SERVER_ROOM"],
        matchMode: "ALL",
      });
      expect(allRes.passed).toBe(false);
      expect(allRes.missingTags).toContain("SERVER_ROOM");

      // ANY mode: has at least one -> allowed
      expect(
        evaluateClearanceAccess(user, {
          requiredClearanceTags: ["SERVER_ROOM", "VAULT_ACCESS"],
          matchMode: "ANY",
        }).passed,
      ).toBe(true);

      // ANY mode: has none -> denied
      const anyRes = evaluateClearanceAccess(user, {
        requiredClearanceTags: ["SERVER_ROOM", "ATM_DISPATCH"],
        matchMode: "ANY",
      });
      expect(anyRes.passed).toBe(false);
    });

    it("denies access when user holds prohibited clearance tags", () => {
      const user = {
        clearanceLevel: "TOP_SECRET" as const,
        clearanceTags: ["VAULT_ACCESS", "SUSPENDED_INVESTIGATION"],
        revoked: false,
      };

      const res = evaluateClearanceAccess(user, {
        requiredClearanceTags: ["VAULT_ACCESS"],
        prohibitedClearanceTags: ["SUSPENDED_INVESTIGATION", "PROBATIONARY"],
      });

      expect(res.passed).toBe(false);
      expect(res.prohibitedTags).toContain("SUSPENDED_INVESTIGATION");
      expect(res.reason).toContain("prohibited clearance tag");
    });

    it("denies access for revoked or expired clearances", () => {
      // Revoked
      const revokedUser = {
        clearanceLevel: "TOP_SECRET" as const,
        clearanceTags: ["VAULT_ACCESS"],
        revoked: true,
        revocationReason: "Security incident pending review",
      };
      const revRes = evaluateClearanceAccess(revokedUser);
      expect(revRes.passed).toBe(false);
      expect(revRes.reason).toContain("REVOKED");

      // Expired
      const expiredUser = {
        clearanceLevel: "SECRET" as const,
        clearanceTags: ["VAULT_ACCESS"],
        validFrom: "2026-01-01T00:00:00Z",
        validUntil: "2026-06-01T00:00:00Z",
        revoked: false,
      };
      const expRes = evaluateClearanceAccess(
        expiredUser,
        undefined,
        new Date("2026-09-12T00:00:00Z"),
      );
      expect(expRes.passed).toBe(false);
      expect(expRes.reason).toContain("EXPIRED");
    });
  });

  // ============================================================================
  // 4. ABAC SERVICE & CONTEXTUAL EVALUATION PIPELINE
  // ============================================================================
  describe("ABAC Service Contextual Policy Pipeline", () => {
    let service: AbacService;
    let repo: InMemoryAbacRepository;

    beforeEach(() => {
      repo = new InMemoryAbacRepository();
      service = new AbacService(repo);
    });

    it("P0: strictly prohibits cross-tenant access", async () => {
      const decision = await service.evaluate({
        subject: {
          userId: "user-1",
          tenantId: "TENANT_A",
          roles: ["SUPER_ADMIN"],
        },
        resource: {
          tenantId: "TENANT_B",
          branchId: "BRANCH_1",
        },
        action: "LIVE_VIEW",
        environment: { sourceIp: "10.0.0.1" },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.decision).toBe("DENY");
      expect(decision.reason).toContain("Cross-tenant access prohibited");
      expect(decision.appliedPolicies).toContain("P0:TenantIsolation:DENY");
    });

    it("evaluates contextual rules with time, subnet, and clearance tags", async () => {
      // Set up a strict dynamic policy
      await service.createPolicy({
        tenantId: "BANK_INDIA",
        name: "Restricted Vault Operations Policy",
        effect: "PERMIT",
        priority: 500,
        actions: ["LIVE_VIEW", "EXPORT_EVIDENCE"],
        resourceTypes: ["CAMERA"],
        resourceClassifications: ["VAULT_STRONG_ROOM"],
        branchScope: ["MUMBAI_MAIN"],
        roles: ["CHIEF_SECURITY_OFFICER", "BRANCH_SECURITY_OFFICER"],
        timeRule: {
          startTime: "09:00",
          endTime: "18:00",
          timezone: "UTC",
        },
        networkRule: {
          allowedSubnets: ["10.10.0.0/16"],
          deniedSubnets: ["10.10.99.0/24"],
        },
        clearanceRule: {
          minClearanceLevel: "SECRET",
          requiredClearanceTags: ["VAULT_ACCESS"],
          matchMode: "ALL",
        },
      });

      // User has clearance
      await service.upsertClearance({
        tenantId: "BANK_INDIA",
        userId: "cso-mumbai",
        clearanceLevel: "SECRET",
        clearanceTags: ["VAULT_ACCESS", "CASH_AREA"],
      });

      // 1. Success case: Within shift, internal subnet, valid clearance
      const successDecision = await service.evaluate({
        subject: {
          userId: "cso-mumbai",
          tenantId: "BANK_INDIA",
          roles: ["CHIEF_SECURITY_OFFICER"],
          branchScope: ["MUMBAI_MAIN"],
        },
        resource: {
          tenantId: "BANK_INDIA",
          branchId: "MUMBAI_MAIN",
          classification: "VAULT_STRONG_ROOM",
        },
        action: "LIVE_VIEW",
        environment: {
          sourceIp: "10.10.5.22",
          requestTimeUtc: "2026-09-12T14:00:00Z", // 14:00 UTC (within 09:00-18:00)
        },
      });

      expect(successDecision.allowed).toBe(true);
      expect(successDecision.decision).toBe("PERMIT");
      expect(successDecision.policyHash).toBeDefined();

      // 2. Failure: Outside allowed time window
      const afterHoursDecision = await service.evaluate({
        subject: {
          userId: "cso-mumbai",
          tenantId: "BANK_INDIA",
          roles: ["CHIEF_SECURITY_OFFICER"],
          branchScope: ["MUMBAI_MAIN"],
        },
        resource: {
          tenantId: "BANK_INDIA",
          branchId: "MUMBAI_MAIN",
          classification: "VAULT_STRONG_ROOM",
        },
        action: "LIVE_VIEW",
        environment: {
          sourceIp: "10.10.5.22",
          requestTimeUtc: "2026-09-12T20:30:00Z", // 20:30 UTC
        },
      });

      expect(afterHoursDecision.allowed).toBe(false);

      // 3. Failure: Denied subnet (10.10.99.15)
      const deniedSubnetDecision = await service.evaluate({
        subject: {
          userId: "cso-mumbai",
          tenantId: "BANK_INDIA",
          roles: ["CHIEF_SECURITY_OFFICER"],
          branchScope: ["MUMBAI_MAIN"],
        },
        resource: {
          tenantId: "BANK_INDIA",
          branchId: "MUMBAI_MAIN",
          classification: "VAULT_STRONG_ROOM",
        },
        action: "LIVE_VIEW",
        environment: {
          sourceIp: "10.10.99.15",
          requestTimeUtc: "2026-09-12T14:00:00Z",
        },
      });

      expect(deniedSubnetDecision.allowed).toBe(false);
      expect(deniedSubnetDecision.reason).toContain("denied");

      // 4. Failure: Revoked user clearance
      await service.revokeClearance({
        tenantId: "BANK_INDIA",
        userId: "cso-mumbai",
        reason: "Credential audit review",
      });

      const revokedDecision = await service.evaluate({
        subject: {
          userId: "cso-mumbai",
          tenantId: "BANK_INDIA",
          roles: ["CHIEF_SECURITY_OFFICER"],
          branchScope: ["MUMBAI_MAIN"],
        },
        resource: {
          tenantId: "BANK_INDIA",
          branchId: "MUMBAI_MAIN",
          classification: "VAULT_STRONG_ROOM",
        },
        action: "LIVE_VIEW",
        environment: {
          sourceIp: "10.10.5.22",
          requestTimeUtc: "2026-09-12T14:00:00Z",
        },
      });

      expect(revokedDecision.allowed).toBe(false);
      expect(revokedDecision.reason).toContain("REVOKED");
    });

    it("verifies explicit DENY policies take absolute priority over PERMIT policies", async () => {
      // Base permit
      await service.createPolicy({
        tenantId: "BANK_INDIA",
        name: "General Permit Rule",
        effect: "PERMIT",
        priority: 100,
        actions: ["*"],
        resourceTypes: ["*"],
        resourceClassifications: ["*"],
        branchScope: ["ALL"],
        roles: ["*"],
        isActive: true,
      });

      // High-priority deny during emergency lock
      await service.createPolicy({
        tenantId: "BANK_INDIA",
        name: "Emergency Freeze Rule",
        effect: "DENY",
        priority: 999,
        actions: ["EXPORT_EVIDENCE"],
        resourceTypes: ["*"],
        resourceClassifications: ["*"],
        branchScope: ["ALL"],
        roles: ["*"],
        isActive: true,
      });

      // Normal live view allowed
      const liveRes = await service.evaluate({
        subject: { userId: "user-1", tenantId: "BANK_INDIA", roles: ["BRANCH_SECURITY_OFFICER"], branchScope: ["ALL"] },
        resource: { tenantId: "BANK_INDIA", branchId: "B-1" },
        action: "LIVE_VIEW",
        environment: { sourceIp: "10.0.0.1" },
      });
      expect(liveRes.allowed).toBe(true);

      // Export evidence blocked by explicit deny
      const exportRes = await service.evaluate({
        subject: { userId: "user-1", tenantId: "BANK_INDIA", roles: ["BRANCH_SECURITY_OFFICER"], branchScope: ["ALL"] },
        resource: { tenantId: "BANK_INDIA", branchId: "B-1" },
        action: "EXPORT_EVIDENCE",
        environment: { sourceIp: "10.0.0.1" },
      });
      expect(exportRes.allowed).toBe(false);
      expect(exportRes.decision).toBe("DENY");
      expect(exportRes.reason).toContain("Emergency Freeze Rule");
    });
  });

  // ============================================================================
  // 5. ABAC POLICY ENGINE BACKWARD COMPATIBILITY
  // ============================================================================
  describe("AbacPolicyEngine Backward Compatibility & Invariants", () => {
    let engine: AbacPolicyEngine;

    beforeEach(() => {
      engine = new AbacPolicyEngine();
    });

    it("enforces clearance level and tag checking in AbacPolicyEngine", () => {
      const decision = engine.evaluate({
        subject: {
          userId: "user-1",
          tenantId: "tenant-blr",
          roles: ["CHIEF_SECURITY_OFFICER"],
          branchScope: ["branch-01"],
          clearanceLevel: "SECRET",
          clearanceTags: ["GENERAL_OPS"],
        },
        resource: {
          tenantId: "tenant-blr",
          branchId: "branch-01",
          classification: "VAULT_STRONG_ROOM",
          requiredClearanceLevel: "TOP_SECRET",
          requiredClearanceTags: ["VAULT_ACCESS"],
        },
        action: "LIVE_VIEW",
        environment: { requestTimeUtc: new Date().toISOString() },
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("Insufficient");
      expect(decision.appliedPolicies).toContain("P6:Clearance:DENY");
    });

    it("allows access when subject satisfies all clearance requirements in AbacPolicyEngine", () => {
      const decision = engine.evaluate({
        subject: {
          userId: "user-cso",
          tenantId: "tenant-blr",
          roles: ["CHIEF_SECURITY_OFFICER"],
          branchScope: ["branch-01"],
          clearanceLevel: "TOP_SECRET",
          clearanceTags: ["VAULT_ACCESS"],
        },
        resource: {
          tenantId: "tenant-blr",
          branchId: "branch-01",
          classification: "VAULT_STRONG_ROOM",
          requiredClearanceLevel: "SECRET",
          requiredClearanceTags: ["VAULT_ACCESS"],
        },
        action: "LIVE_VIEW",
        environment: { requestTimeUtc: new Date().toISOString() },
      });

      expect(decision.allowed).toBe(true);
      expect(decision.appliedPolicies).toContain("P6:Clearance:PASS");
    });
  });

  // ============================================================================
  // 6. FASTIFY REST API ENDPOINTS
  // ============================================================================
  describe("ABAC Fastify REST API (/v1/security/abac/*)", () => {
    let app: ReturnType<typeof Fastify>;

    beforeEach(async () => {
      app = Fastify();
      // Initialize in-memory repository for route testing
      const repo = new InMemoryAbacRepository();
      const service = new AbacService(repo);
      await registerAbacRoutes(app);
      await app.ready();
    });

    it("GET /v1/security/abac/status returns HEALTHY and metrics", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/security/abac/status",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe("HEALTHY");
      expect(body.capabilityId).toBe("security.abac");
      expect(body.maturity).toBe("PRODUCTION");
      expect(body.metrics).toBeDefined();
    });

    it("POST /v1/security/abac/policies creates a dynamic policy", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/security/abac/policies",
        payload: {
          tenantId: "BANK-MUMBAI",
          name: "ATM Maintenance Window Policy",
          description: "Allows engineers to service ATM cameras between 02:00 and 05:00",
          effect: "PERMIT",
          priority: 300,
          actions: ["LIVE_VIEW", "MANAGE_CAMERA"],
          resourceClassifications: ["ATM_KIOSK"],
          roles: ["MAINTENANCE_ENGINEER"],
          timeRule: {
            startTime: "02:00",
            endTime: "05:00",
            timezone: "Asia/Kolkata",
          },
          networkRule: {
            allowedSubnets: ["10.20.0.0/16"],
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.policy.id).toBeDefined();
      expect(body.policy.name).toBe("ATM Maintenance Window Policy");
    });

    it("POST /v1/security/abac/users/:userId/clearance manages clearance tags", async () => {
      // Grant clearance
      const grantRes = await app.inject({
        method: "POST",
        url: "/v1/security/abac/users/eng-404/clearance",
        payload: {
          tenantId: "BANK-MUMBAI",
          clearanceLevel: "SECRET",
          clearanceTags: ["ATM_ACCESS", "EQUIPMENT_MAINTENANCE"],
          issuedBy: "chief-officer",
        },
      });

      expect(grantRes.statusCode).toBe(200);
      const grantBody = grantRes.json();
      expect(grantBody.clearance.userId).toBe("eng-404");
      expect(grantBody.clearance.clearanceLevel).toBe("SECRET");
      expect(grantBody.clearance.clearanceTags).toContain("ATM_ACCESS");

      // Query clearance
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/security/abac/users/eng-404/clearance?tenantId=BANK-MUMBAI",
      });

      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().clearance.clearanceTags).toContain("EQUIPMENT_MAINTENANCE");

      // Revoke clearance
      const revokeRes = await app.inject({
        method: "POST",
        url: "/v1/security/abac/users/eng-404/clearance/revoke",
        payload: {
          tenantId: "BANK-MUMBAI",
          reason: "Scheduled badge rotation",
        },
      });

      expect(revokeRes.statusCode).toBe(200);
      expect(revokeRes.json().clearance.revoked).toBe(true);
    });

    it("POST /v1/security/abac/evaluate runs contextual evaluation over HTTP", async () => {
      const evaluateRes = await app.inject({
        method: "POST",
        url: "/v1/security/abac/evaluate",
        payload: {
          subject: {
            userId: "officer-99",
            tenantId: "BANK-01",
            roles: ["BRANCH_SECURITY_OFFICER"],
            branchScope: ["BRANCH-SOUTH"],
          },
          resource: {
            tenantId: "BANK-01",
            branchId: "BRANCH-SOUTH",
            classification: "PUBLIC_LOBBY",
          },
          action: "LIVE_VIEW",
          environment: {
            sourceIp: "10.0.1.5",
            requestTimeUtc: new Date().toISOString(),
          },
        },
      });

      expect(evaluateRes.statusCode).toBe(200);
      const body = evaluateRes.json();
      expect(body.success).toBe(true);
      expect(body.decision).toBe("PERMIT");
      expect(body.allowed).toBe(true);
      expect(body.auditLogId).toBeDefined();
    });

    it("POST /v1/security/abac/evaluate returns 403 when access is denied", async () => {
      const evaluateRes = await app.inject({
        method: "POST",
        url: "/v1/security/abac/evaluate",
        payload: {
          subject: {
            userId: "operator-01",
            tenantId: "BANK-01",
            roles: ["VIRTUAL_GUARD_OPERATOR"],
            branchScope: ["BRANCH-NORTH"], // Operator not authorized for BRANCH-SOUTH
          },
          resource: {
            tenantId: "BANK-01",
            branchId: "BRANCH-SOUTH",
            classification: "PUBLIC_LOBBY",
          },
          action: "LIVE_VIEW",
        },
      });

      expect(evaluateRes.statusCode).toBe(403);
      const body = evaluateRes.json();
      expect(body.allowed).toBe(false);
      expect(body.decision).toBe("DENY");
      expect(body.reason).toContain("outside operator branch scope");
    });
  });
});
