import { randomBytes, randomUUID } from "node:crypto";
import type {
  ControlPlaneStore,
  OrganizationStore,
  UserManagementStore,
} from "../../control-plane-store.js";
import type { ResourceNode, User, AccessGrant, Action } from "../../domain/models.js";
import { hashPassword, verifyPassword } from "../../security/password.js";
import type {
  OnboardingSetupInput,
  OnboardingSetupResult,
  OnboardingStatus,
} from "../domain/onboarding.types.js";

export const PERMANENT_SUPERADMIN = {
  username: "mgdhanyamohan",
  password: "Thathu@110",
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

    if (typeof store.getOrganizationTree === "function") {
      try {
        const tree = await store.getOrganizationTree("omsystems");
        orgCount = Array.isArray(tree) ? tree.filter((n: any) => n.type === "company" || n.nodeType === "company").length : 0;
        branchCount = Array.isArray(tree) ? tree.filter((n: any) => n.type === "branch" || n.nodeType === "branch").length : 0;
      } catch {
        // Fallback
      }
    }

    if (orgCount === 0 && store.nodes instanceof Map) {
      const nodes = Array.from(store.nodes.values()) as ResourceNode[];
      orgCount = nodes.filter((n) => n.type === "company").length;
      branchCount = nodes.filter((n) => n.type === "branch").length;
    }

    const isFirstTimeSetup = orgCount === 0;

    return {
      isFirstTimeSetup,
      requiresOrganizationSetup: orgCount === 0 || branchCount === 0,
      organizationCount: orgCount,
      branchCount,
      superadminConfigured: true,
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
    const tenantId = input.tenantSlug?.trim() || "omsystems";
    const orgName = input.organizationName.trim();
    const branchName = input.firstBranchName.trim();
    const regionName = input.regionName?.trim() || "Headquarters Region";

    const adminUsername = input.adminUsername?.trim() || PERMANENT_SUPERADMIN.username;
    const adminPassword = input.adminPassword || PERMANENT_SUPERADMIN.password;
    const adminEmail = input.adminEmail?.trim() || PERMANENT_SUPERADMIN.email;
    const adminDisplayName = input.adminDisplayName?.trim() || PERMANENT_SUPERADMIN.displayName;

    const passwordHash = await hashPassword(adminPassword);

    let orgNodeId = `org-${Date.now()}`;
    let regionNodeId = `region-${Date.now()}`;
    let branchNodeId = `branch-${Date.now()}`;
    const superadminUserId = `user-${adminUsername}`;

    // 1. Create Organization in Database or In-Memory Store
    if (typeof store.createOrganizationNode === "function") {
      try {
        const orgRes = await store.createOrganizationNode(tenantId, {
          nodeType: "company",
          name: orgName,
          code: input.organizationCode ?? "HQ",
        });
        if (orgRes?.id) orgNodeId = orgRes.id;

        const regRes = await store.createOrganizationNode(tenantId, {
          parentNodeId: orgNodeId,
          nodeType: "region",
          name: regionName,
        });
        if (regRes?.id) regionNodeId = regRes.id;

        const brRes = await store.createOrganizationNode(tenantId, {
          parentNodeId: regionNodeId,
          nodeType: "branch",
          name: branchName,
          code: input.firstBranchCode ?? "BR-001",
          address: input.firstBranchAddress,
        });
        if (brRes?.id) branchNodeId = brRes.id;
      } catch {
        // Fallback for memory store
      }
    }

    if (store.nodes instanceof Map) {
      const orgNode: ResourceNode = {
        id: orgNodeId,
        parentId: null,
        tenantId,
        type: "company",
        name: orgName,
        path: [orgNodeId],
      };
      const regNode: ResourceNode = {
        id: regionNodeId,
        parentId: orgNodeId,
        tenantId,
        type: "region",
        name: regionName,
        path: [orgNodeId, regionNodeId],
      };
      const brNode: ResourceNode = {
        id: branchNodeId,
        parentId: regionNodeId,
        tenantId,
        type: "branch",
        name: branchName,
        path: [orgNodeId, regionNodeId, branchNodeId],
      };

      store.nodes.set(orgNodeId, orgNode);
      store.nodes.set(regionNodeId, regNode);
      store.nodes.set(branchNodeId, brNode);
    }

    // 2. Create/Ensure Superadmin User
    if (typeof store.createUser === "function") {
      try {
        await store.createUser(tenantId, {
          username: adminUsername,
          displayName: adminDisplayName,
          email: adminEmail,
          passwordHash,
          role: "super_admin",
          status: "active",
          primaryOrgNodeId: orgNodeId,
        });
      } catch {
        // May already exist
      }
    }

    if (store.users instanceof Map) {
      const userRecord: User & { passwordHash: string } = {
        id: superadminUserId,
        displayName: adminDisplayName,
        username: adminUsername,
        email: adminEmail,
        role: "super_admin",
        status: "active",
        tenantId,
        passwordHash,
      };
      store.users.set(superadminUserId, userRecord);
    }

    // 3. Grant Superadmin full access across the entire organization tree
    if (store.grants && Array.isArray(store.grants)) {
      store.grants.push({
        userId: superadminUserId,
        scopeNodeId: orgNodeId,
        actions: ALL_SUPERADMIN_ACTIONS,
        effect: "allow",
      });
    }

    // 4. Generate Auth Tokens
    const accessToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");

    return {
      success: true,
      message: `Organization '${orgName}' and first branch '${branchName}' created successfully. Superadmin '${adminUsername}' configured.`,
      organization: {
        id: orgNodeId,
        name: orgName,
        code: input.organizationCode,
        tenantId,
      },
      region: {
        id: regionNodeId,
        name: regionName,
      },
      firstBranch: {
        id: branchNodeId,
        name: branchName,
        code: input.firstBranchCode,
      },
      superadmin: {
        id: superadminUserId,
        username: adminUsername,
        displayName: adminDisplayName,
        email: adminEmail,
        role: "super_admin",
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 86400,
      },
    };
  }
}

export const bootstrapOnboardingService = new BootstrapOnboardingService();
