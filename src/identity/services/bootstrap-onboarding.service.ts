import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { InfrastructureRepository } from "../../database/infrastructure-repository.js";
import type { Action } from "../../domain/models.js";
import { hashPassword, verifyPassword } from "../../security/password.js";
import type {
  OnboardingSetupInput,
  OnboardingSetupResult,
  OnboardingStatus,
} from "../domain/onboarding.types.js";

export const PERMANENT_SUPERADMIN = {
  username: "mgdhanyamohan",
  // Bootstrap credentials must be supplied by the deployment environment or
  // explicitly during first-time onboarding. Never ship a default password.
  password: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD ?? "",
  displayName: "Dhanya Mohan (Superadmin)",
  email: "mgdhanyamohan@omsystems.bank",
  role: "super_admin" as const,
  status: "active" as const,
};

const ALL_SUPERADMIN_ACTIONS: Action[] = [
  "live:view", "audio:talk", "recording:view", "evidence:export", "ptz:operate", "alarm:acknowledge",
  "device:configure", "user:manage", "audit:view", "org:manage",
  "analytics:view", "analytics:configure", "alerts:acknowledge", "alerts:escalate", "analytics:export",
  "incident:create", "incident:view", "incident:update", "incident:assign", "incident:escalate", "incident:close", "incident:reopen",
  "investigation:view", "investigation:manage", "investigation:enhance",
  "evidence:create", "evidence:view", "evidence:preserve", "evidence:export-package", "evidence:approve", "evidence:share",
  "evidence:legal-hold", "evidence:release-hold",
  "police:update", "insurance:update", "incident-report:approve",
  "face:view", "face:enrol", "face:manage-watchlist",
  "anpr:view", "anpr:search", "anpr:manage-watchlist",
  "behavior:view",
];

export class BootstrapOnboardingService {
  /**
   * Evaluates whether the system is on first-time setup or requires organization bootstrap
   */
  async getOnboardingStatus(store: any): Promise<OnboardingStatus> {
    let orgCount = 0;
    let branchCount = 0;
    const pool = store.db ?? store.pool;
    if (pool?.query) {
      // Count globally: an alternate tenant slug must not reopen bootstrap.
      const result = await pool.query(`SELECT
        count(*) FILTER (WHERE node_type='company')::int AS organizations,
        count(*) FILTER (WHERE node_type='branch')::int AS branches
        FROM resource_nodes`);
      orgCount = Number(result.rows[0]?.organizations ?? 0);
      branchCount = Number(result.rows[0]?.branches ?? 0);
    } else if (store.nodes instanceof Map) {
      for (const node of store.nodes.values()) {
        if (node.type === "company") orgCount++;
        if (node.type === "branch") branchCount++;
      }
    } else {
      const tree = await store.getOrganizationTree("omsystems");
      const visit = (nodes: any[]) => {
        for (const node of nodes) {
          if ((node.type ?? node.nodeType) === "company") orgCount++;
          if ((node.type ?? node.nodeType) === "branch") branchCount++;
          if (Array.isArray(node.children)) visit(node.children);
        }
      };
      visit(tree);
    }

    const isFirstTimeSetup = orgCount === 0;

    return {
      isFirstTimeSetup,
      requiresOrganizationSetup: orgCount === 0 || branchCount === 0,
      organizationCount: orgCount,
      branchCount,
      superadminConfigured: Boolean(PERMANENT_SUPERADMIN.password),
      defaultSuperadminUsername: PERMANENT_SUPERADMIN.username,
      message: isFirstTimeSetup
        ? "First-time deployment detected. Please configure your Organization and First Branch before login."
        : "System initialized and active.",
    };
  }

  /**
   * First-Time Pre-Login Setup: Creates Organization, Region, First Branch, and provisions Superadmin
   */
  async setupFirstTimeOnboarding(
    store: any,
    input: OnboardingSetupInput,
  ): Promise<OnboardingSetupResult> {
    const pool = store.db ?? store.pool;
    if (pool?.connect) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize initialization across API instances and roll back every
        // organization/user/session write if any step fails.
        await client.query("SELECT pg_advisory_xact_lock(739214608)");
        const transactionalStore = new InfrastructureRepository(client as unknown as Pool);
        const result = await this.performSetup(transactionalStore, input);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    return this.performSetup(store, input);
  }

  private async performSetup(store: any, input: OnboardingSetupInput): Promise<OnboardingSetupResult> {
    const status = await this.getOnboardingStatus(store);
    if (!status.isFirstTimeSetup) throw new Error("onboarding_already_completed");
    const tenantId = input.tenantSlug?.trim() || "omsystems";
    const orgName = input.organizationName.trim();
    const branchName = input.firstBranchName.trim();
    const regionName = input.regionName?.trim() || "Headquarters Region";
    const adminUsername = input.adminUsername?.trim() || PERMANENT_SUPERADMIN.username;
    const adminPassword = input.adminPassword;
    if (!adminPassword || adminPassword.length < 8) throw new Error("admin_password_required");
    if (PERMANENT_SUPERADMIN.password && adminPassword !== PERMANENT_SUPERADMIN.password) {
      throw new Error("invalid_bootstrap_credentials");
    }
    const adminEmail = input.adminEmail?.trim() || PERMANENT_SUPERADMIN.email;
    const adminDisplayName = input.adminDisplayName?.trim() || PERMANENT_SUPERADMIN.displayName;
    const existingAdmin = await store.findUserByUsername(adminUsername, tenantId);
    if (existingAdmin && (existingAdmin.status !== "active" || existingAdmin.role !== "super_admin" ||
      !(await verifyPassword(adminPassword, existingAdmin.passwordHash)))) {
      throw new Error("invalid_bootstrap_credentials");
    }
    const passwordHash = await hashPassword(adminPassword);
    const org = await store.createOrganizationNode(tenantId, {
      nodeType: "company", name: orgName, code: input.organizationCode ?? "HQ",
    });
    if (!org?.id) throw new Error("organization_creation_failed");
    const region = await store.createOrganizationNode(tenantId, {
      parentNodeId: org.id, nodeType: "region", name: regionName,
    });
    if (!region?.id) throw new Error("region_creation_failed");
    const branch = await store.createOrganizationNode(tenantId, {
      parentNodeId: region.id, nodeType: "branch", name: branchName,
      code: input.firstBranchCode ?? "BR-001", address: input.firstBranchAddress,
    });
    if (!branch?.id) throw new Error("branch_creation_failed");

    let admin = existingAdmin;
    if (!admin && typeof store.createUser === "function") {
      admin = await store.createUser(tenantId, {
        username: adminUsername, displayName: adminDisplayName, email: adminEmail,
        passwordHash, role: "super_admin", status: "active", primaryOrgNodeId: org.id,
      });
    } else if (!admin && store.users instanceof Map) {
      admin = { id: `user-${adminUsername}`, displayName: adminDisplayName,
        username: adminUsername, email: adminEmail, role: "super_admin",
        status: "active", tenantId, passwordHash };
      store.users.set(admin.id, admin);
    }
    if (!admin?.id) throw new Error("admin_creation_failed");
    if (existingAdmin && typeof store.assignUserToOrganization === "function") {
      const assignment = await store.assignUserToOrganization(
        admin.id,
        org.id,
        true,
        admin.id,
      );
      if (!assignment?.id) throw new Error("admin_assignment_failed");
    }
    if (Array.isArray(store.grants)) {
      store.grants.push({ userId: admin.id, scopeNodeId: org.id,
        actions: ALL_SUPERADMIN_ACTIONS, effect: "allow" });
    }
    const accessToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");
    const hashToken = (token: string) => createHash("sha256").update(token).digest("base64");
    const session = await store.createUserSession(admin.id, admin.tenantId ?? tenantId,
      hashToken(accessToken), hashToken(refreshToken));
    if (!session?.id) throw new Error("session_creation_failed");
    const expiry = new Date(session.accessExpiresAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("invalid_session_expiry");

    return {
      success: true,
      message: `Organization '${orgName}' and first branch '${branchName}' created successfully.`,
      organization: { id: org.id, name: orgName, code: input.organizationCode, tenantId: org.tenantId ?? tenantId },
      region: { id: region.id, name: regionName },
      firstBranch: { id: branch.id, name: branchName, code: input.firstBranchCode },
      superadmin: { id: admin.id, username: adminUsername, displayName: adminDisplayName,
        email: adminEmail, role: "super_admin" },
      tokens: { accessToken, refreshToken, expiresIn: Math.max(1, Math.floor((expiry - Date.now()) / 1000)) },
    };
  }

}

export const bootstrapOnboardingService = new BootstrapOnboardingService();
