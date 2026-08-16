/**
 * Enterprise Recipient Resolution - Verification Test Runner
 */

import { RecipientResolver } from "../../src/notifications/application/recipient-resolver.js";
import { OrganizationalDirectoryService } from "../../src/notifications/application/organizational-directory.service.js";
import { UserDirectoryService } from "../../src/notifications/application/user-directory.service.js";
import { registerNotificationRoutes } from "../../src/routes/notification.routes.js";
import Fastify from "fastify";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}`);
    failed++;
  }
}

async function runRecipientResolutionTests() {
  console.log("================================================================================");
  console.log("  ENTERPRISE RECIPIENT RESOLUTION - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const orgDir = new OrganizationalDirectoryService();
  const userDir = new UserDirectoryService();
  const resolver = new RecipientResolver(orgDir, userDir);

  const tenantId = "tenant-bank-01";
  const now = new Date();

  // --------------------------------------------------------------------------
  // Suite 1: Branch Role & Scope Resolution
  // --------------------------------------------------------------------------
  console.log("Suite 1: Branch Role & Scope Resolution");

  const branchRes = await resolver.resolveComprehensive({
    context: {
      tenantId,
      alertId: "alert-01",
      branchId: "branch-thrissur-14",
      priority: "P1",
      alertType: "intrusion",
      occurredAt: now,
      escalationLevel: 0,
    },
    selectors: [{ type: "BRANCH_ROLE", role: "BRANCH_MANAGER" }],
    requiredChannels: ["sms", "email", "voice"],
  });

  assert(branchRes.recipients.length === 1, "Resolves exactly 1 Branch Manager");
  assert(branchRes.recipients[0]?.displayName.includes("Ajith Kumar") === true, "Resolves correct Branch Manager (Ajith Kumar)");
  assert(branchRes.recipients[0]?.reasons.includes("BRANCH_MANAGER") === true, "Records BRANCH_MANAGER reason");

  // Wrong Branch Lookup -> Warning generated
  const wrongBranchRes = await resolver.resolveComprehensive({
    context: {
      tenantId,
      alertId: "alert-02",
      branchId: "branch-unassigned-999",
      priority: "P1",
      alertType: "intrusion",
      occurredAt: now,
      escalationLevel: 0,
    },
    selectors: [{ type: "BRANCH_ROLE", role: "BRANCH_MANAGER" }],
    requiredChannels: ["sms"],
  });
  assert(wrongBranchRes.recipients.length === 0, "Unassigned branch returns 0 recipients");
  assert(wrongBranchRes.warnings.some((w) => w.code === "ROLE_UNASSIGNED"), "Emits ROLE_UNASSIGNED warning");

  // --------------------------------------------------------------------------
  // Suite 2: Shift Schedule Resolution (Active vs Off-Shift)
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Shift Schedule Resolution");

  const shiftRes = await resolver.resolveComprehensive({
    context: {
      tenantId,
      alertId: "alert-03",
      priority: "P1",
      alertType: "intrusion",
      occurredAt: now,
      escalationLevel: 0,
    },
    selectors: [{ type: "TENANT_ROLE", role: "HO_OPERATOR" }],
    requiredChannels: ["dashboard", "sms"],
  });

  assert(shiftRes.recipients.length === 1, "Resolves active shift operator");
  assert(shiftRes.recipients[0]?.displayName.includes("Sanjay P") === true, "Resolves current duty operator (Sanjay P)");
  assert(shiftRes.recipients[0]?.reasons.includes("HO_OPERATOR") === true, "Assigns HO_OPERATOR reason");

  // Past timestamp (3 days ago with no shift) -> Emits NO_ACTIVE_SHIFT_OPERATOR
  const pastShiftRes = await resolver.resolveComprehensive({
    context: {
      tenantId,
      alertId: "alert-04",
      priority: "P1",
      alertType: "intrusion",
      occurredAt: new Date("2025-01-01T00:00:00Z"),
      escalationLevel: 0,
    },
    selectors: [{ type: "TENANT_ROLE", role: "HO_OPERATOR" }],
    requiredChannels: ["sms"],
  });
  assert(pastShiftRes.warnings.some((w) => w.code === "NO_ACTIVE_SHIFT_OPERATOR"), "Emits NO_ACTIVE_SHIFT_OPERATOR warning for off-shift time");

  // --------------------------------------------------------------------------
  // Suite 3: On-Call Rotation Resolution
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: On-Call Rotation Resolution");

  const onCallRes = await resolver.resolveComprehensive({
    context: {
      tenantId,
      alertId: "alert-05",
      priority: "P1",
      alertType: "intrusion",
      occurredAt: now,
      escalationLevel: 0,
    },
    selectors: [{ type: "ON_CALL", scheduleKey: "SURVEILLANCE_AFTER_HOURS" }],
    requiredChannels: ["sms", "voice"],
  });

  assert(onCallRes.recipients.length === 1, "Resolves active on-call officer");
  assert(onCallRes.recipients[0]?.displayName.includes("Rahul Nair") === true, "Resolves on-call officer Rahul Nair");

  // --------------------------------------------------------------------------
  // Suite 4: Multi-Role User Deduplication with Channel Union
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Multi-Role User Deduplication & Channel Union");

  // In our seeds: Rahul Nair is REGIONAL_SECURITY_OFFICER and ON_CALL officer
  const multiRoleRes = await resolver.resolveComprehensive({
    context: {
      tenantId,
      alertId: "alert-06",
      branchId: "branch-thrissur-14",
      regionId: "region-thrissur",
      priority: "P1",
      alertType: "vault_intrusion",
      occurredAt: now,
      escalationLevel: 0,
    },
    selectors: [
      { type: "REGION_ROLE", role: "REGIONAL_SECURITY_OFFICER" },
      { type: "ON_CALL", scheduleKey: "SURVEILLANCE_AFTER_HOURS" },
    ],
    requiredChannels: ["sms", "email", "voice"],
  });

  assert(multiRoleRes.recipients.length === 1, "Deduplicates candidate matching 2 roles into 1 recipient");
  const rahul = multiRoleRes.recipients[0];
  assert(rahul?.reasons.includes("REGIONAL_SECURITY") === true, "Contains REGIONAL_SECURITY reason");
  assert(rahul?.reasons.includes("ON_CALL") === true, "Contains ON_CALL reason");
  assert(!!rahul?.channels.sms, "Has SMS endpoint");
  assert(!!rahul?.channels.email, "Has Email endpoint");
  assert(!!rahul?.channels.voice, "Has Voice endpoint");

  // --------------------------------------------------------------------------
  // Suite 5: Phone Verification Enforcement
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Phone Verification Enforcement");

  // User Kiran Dev has unverified phone
  const unverifiedRes = await resolver.resolveComprehensive({
    context: {
      tenantId,
      alertId: "alert-07",
      priority: "P1",
      alertType: "intrusion",
      occurredAt: now,
      escalationLevel: 0,
    },
    selectors: [{ type: "USER", userId: "user-unverified-bm" }],
    requiredChannels: ["sms", "voice"],
  });

  assert(unverifiedRes.warnings.some((w) => w.code === "PHONE_UNVERIFIED"), "Emits PHONE_UNVERIFIED warning");
  assert(unverifiedRes.recipients[0]?.channels.sms === undefined, "Suppresses SMS dispatch to unverified phone");
  assert(unverifiedRes.recipients[0]?.channels.voice === undefined, "Suppresses Voice dispatch to unverified phone");

  // --------------------------------------------------------------------------
  // Suite 6: Branch Readiness Audit Tool
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Branch Readiness Audit Tool");

  const readyBranch = await resolver.checkBranchReadiness(tenantId, "branch-thrissur-14");
  assert(readyBranch.ready === true, "Configured Thrissur 14 branch is marked P1 READY");
  assert(readyBranch.recipientSelectors.length === 4, "Audited 4 critical operational roles");

  const unreadyBranch = await resolver.checkBranchReadiness(tenantId, "branch-unready-001");
  assert(unreadyBranch.ready === false, "Unassigned branch is marked NOT READY");
  assert(unreadyBranch.warnings.length > 0, "Contains diagnostic warnings explaining missing roles");

  // --------------------------------------------------------------------------
  // Suite 7: REST Control-Plane Endpoints
  // --------------------------------------------------------------------------
  console.log("\nSuite 7: REST Control-Plane Endpoints");

  const app = Fastify();
  await registerNotificationRoutes(app);

  // 1. POST /v1/notifications/test-resolution
  const testRes = await app.inject({
    method: "POST",
    url: "/v1/notifications/test-resolution",
    payload: {
      tenantId,
      branchId: "branch-thrissur-14",
      priority: "P1",
    },
  });
  assert(testRes.statusCode === 200, "POST /v1/notifications/test-resolution returns 200 OK");
  const testData = JSON.parse(testRes.body);
  assert(testData.data.uniqueRecipientsCount >= 3, "Test resolution returns 3 unique operational recipients");

  // 2. GET /v1/notifications/readiness
  const readyRes = await app.inject({
    method: "GET",
    url: "/v1/notifications/readiness?branchId=branch-thrissur-14",
  });
  assert(readyRes.statusCode === 200, "GET /v1/notifications/readiness returns 200 OK");
  const readyData = JSON.parse(readyRes.body);
  assert(readyData.data.ready === true, "Readiness API returns branch readiness status");

  // --------------------------------------------------------------------------
  // Final Results
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRecipientResolutionTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
