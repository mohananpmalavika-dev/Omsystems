/**
 * First-Time Onboarding & Superadmin Authentication - Verification Test Runner
 */

import Fastify from "fastify";
import { MemoryStore } from "../../src/store.js";
import { registerAuthRoutes } from "../../src/routes/auth.routes.js";
import { bootstrapOnboardingService, PERMANENT_SUPERADMIN } from "../../src/identity/services/bootstrap-onboarding.service.js";
import { verifyPassword } from "../../src/security/password.js";

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

async function runOnboardingTests() {
  console.log("================================================================================");
  console.log("  ONBOARDING & SUPERADMIN AUTHENTICATION - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const store = new MemoryStore();
  const app = Fastify();
  await registerAuthRoutes(app, store as any);

  // --------------------------------------------------------------------------
  // Suite 1: Permanent Superadmin Configuration
  // --------------------------------------------------------------------------
  console.log("Suite 1: Permanent Superadmin Configuration");

  assert(PERMANENT_SUPERADMIN.username === "mgdhanyamohan", "Superadmin username is mgdhanyamohan");
  assert(PERMANENT_SUPERADMIN.password === "Thathu@110", "Superadmin default password is Thathu@110");
  assert(PERMANENT_SUPERADMIN.role === "super_admin", "Superadmin role is super_admin");

  const seededUser = store.users.get("user-superadmin-mgdhanyamohan");
  assert(seededUser !== undefined, "Superadmin mgdhanyamohan is pre-seeded in user store");
  assert(seededUser?.role === "super_admin", "Seeded user has super_admin role");

  const superadminGrant = store.grants.find((g) => g.userId === "user-superadmin-mgdhanyamohan");
  assert(superadminGrant !== undefined, "Superadmin has global access grants");
  assert(superadminGrant?.actions.includes("org:manage") === true, "Grant includes org:manage");
  assert(superadminGrant?.actions.includes("user:manage") === true, "Grant includes user:manage");

  // --------------------------------------------------------------------------
  // Suite 2: Pre-Login Onboarding Status Endpoint
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Pre-Login Onboarding Status Endpoint");

  const statusRes = await app.inject({
    method: "GET",
    url: "/v1/auth/onboarding/status",
  });
  assert(statusRes.statusCode === 200, "GET /v1/auth/onboarding/status returns 200 OK");
  const statusData = JSON.parse(statusRes.body);
  assert(statusData.success === true, "Response reports success");
  assert(statusData.data.defaultSuperadminUsername === "mgdhanyamohan", "Identifies default superadmin mgdhanyamohan");

  // --------------------------------------------------------------------------
  // Suite 3: Pre-Login Organization & First Branch Setup
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Pre-Login Organization & First Branch Setup");

  const setupRes = await app.inject({
    method: "POST",
    url: "/v1/auth/onboarding/setup",
    payload: {
      organizationName: "Federal Bank of India",
      organizationCode: "FBI",
      tenantSlug: "federal-bank",
      regionName: "Kerala South Region",
      firstBranchName: "Thrissur Main Branch 118",
      firstBranchCode: "BR-118",
      firstBranchAddress: {
        street: "Round South",
        city: "Thrissur",
        state: "Kerala",
        postalCode: "680001",
        country: "India",
      },
      adminUsername: "mgdhanyamohan",
      adminPassword: "Thathu@110",
      adminEmail: "mgdhanyamohan@omsystems.bank",
    },
  });

  assert(setupRes.statusCode === 201, "POST /v1/auth/onboarding/setup returns 201 Created");
  const setupData = JSON.parse(setupRes.body);
  assert(setupData.data.organization.name === "Federal Bank of India", "Creates organization 'Federal Bank of India'");
  assert(setupData.data.region.name === "Kerala South Region", "Creates region 'Kerala South Region'");
  assert(setupData.data.firstBranch.name === "Thrissur Main Branch 118", "Creates first branch 'Thrissur Main Branch 118'");
  assert(setupData.data.superadmin.username === "mgdhanyamohan", "Provisions superadmin mgdhanyamohan");
  assert(typeof setupData.data.tokens.accessToken === "string", "Returns accessToken for immediate dashboard entry");

  // Verify created nodes in store
  const createdOrg = Array.from(store.nodes.values()).find((n) => n.name === "Federal Bank of India");
  assert(createdOrg !== undefined && createdOrg.type === "company", "Organization node exists in memory store");

  const createdBranch = Array.from(store.nodes.values()).find((n) => n.name === "Thrissur Main Branch 118");
  assert(createdBranch !== undefined && createdBranch.type === "branch", "First branch node exists in memory store");
  assert(createdBranch?.path.length === 3, "Branch node has 3-tier hierarchy path (Org -> Region -> Branch)");

  // --------------------------------------------------------------------------
  // Suite 4: Superadmin Login Verification
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Superadmin Login Verification");

  // 1. Successful login
  const loginRes = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      username: "mgdhanyamohan",
      password: "Thathu@110",
    },
  });
  assert(loginRes.statusCode === 200, "POST /v1/auth/login with mgdhanyamohan / Thathu@110 returns 200 OK");
  const loginData = JSON.parse(loginRes.body);
  assert(loginData.user.username === "mgdhanyamohan", "Returns authenticated user mgdhanyamohan");
  assert(loginData.user.role === "super_admin", "Authenticated user role is super_admin");
  assert(typeof loginData.accessToken === "string", "Returns valid access token");

  // 2. Reject incorrect password
  const failRes = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      username: "mgdhanyamohan",
      password: "WrongPassword@123",
    },
  });
  assert(failRes.statusCode === 401, "Rejects login with invalid password (401 Unauthorized)");

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

runOnboardingTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
