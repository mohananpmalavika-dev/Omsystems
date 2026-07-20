import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  AuthenticationStore,
  ControlPlaneStore,
  UserManagementStore,
} from "../control-plane-store.js";
import { hashPassword, verifyPassword } from "../security/password.js";

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(50),
  displayName: z.string().trim().min(2).max(200),
  password: z.string().min(8).max(100),
  employeeId: z.string().trim().max(50).optional(),
  phoneNumber: z.string().max(20).optional(),
  role: z.enum([
    "super_admin",
    "company_admin",
    "hq_admin",
    "zone_manager",
    "region_manager",
    "area_manager",
    "branch_manager",
    "operator",
    "viewer",
    "security_officer",
    "auditor",
  ]),
  department: z.string().max(100).optional(),
  designation: z.string().max(100).optional(),
  dateOfJoining: z.string().optional(),
  dateOfBirth: z.string().optional(),
  reportingToUserId: z.string().uuid().optional(),
  primaryOrgNodeId: z.string().uuid(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().trim().min(2).max(200).optional(),
  phoneNumber: z.string().max(20).optional(),
  role: z
    .enum([
      "super_admin",
      "company_admin",
      "hq_admin",
      "zone_manager",
      "region_manager",
      "area_manager",
      "branch_manager",
      "operator",
      "viewer",
      "security_officer",
      "auditor",
    ])
    .optional(),
  status: z
    .enum(["active", "inactive", "suspended", "pending_activation", "locked"])
    .optional(),
  department: z.string().max(100).optional(),
  designation: z.string().max(100).optional(),
  dateOfJoining: z.string().optional(),
  dateOfBirth: z.string().optional(),
  reportingToUserId: z.string().uuid().nullable().optional(),
  preferences: z.record(z.unknown()).optional(),
});

const assignOrgSchema = z.object({
  scopeNodeId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(100),
});

const userIdSchema = z.object({ id: z.string().uuid() });

export async function registerUserRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore & UserManagementStore & AuthenticationStore,
) {
  // List users
  app.get("/v1/users", async (request) => {
    const query = z
      .object({
        role: z
          .enum([
            "super_admin",
            "company_admin",
            "hq_admin",
            "zone_manager",
            "region_manager",
            "area_manager",
            "branch_manager",
            "operator",
            "viewer",
            "security_officer",
            "auditor",
          ])
          .optional(),
        status: z
          .enum([
            "active",
            "inactive",
            "suspended",
            "pending_activation",
            "locked",
          ])
          .optional(),
        orgNodeId: z.string().uuid().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);

    const manageableNodes = await store.listAccessibleNodes(
      request.currentUser,
      "user:manage",
    );
    if (manageableNodes.length === 0) {
      return { data: [], total: 0 };
    }

    const result = await store.listUsers(
      request.currentUser.tenantId,
      { ...query, managerUserId: request.currentUser.id },
    );

    const data = result.data.filter(
      (user: any) =>
        user.id === request.currentUser.id ||
        canManageRole(request.currentUser.role, user.role),
    );
    return { data, total: data.length };
  });

  // Get user by ID
  app.get("/v1/users/:id", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);

    // Check permission (can view self or has user:manage)
    if (
      id !== request.currentUser.id &&
      !(await hasPermissionForUser(request, store, "user:manage", id))
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const user = await store.getUserDetails(id);

    if (!user || user.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    return user;
  });

  // Create user
  app.post("/v1/users", async (request, reply) => {
    const body = createUserSchema.parse(request.body);

    // Check permission
    if (
      !(await hasPermission(
        request,
        store,
        "user:manage",
        body.primaryOrgNodeId,
      ))
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }
    if (!canAssignRole(request.currentUser.role, body.role)) {
      return reply.code(403).send({
        error: "forbidden",
        message: "You cannot assign a role at or above your own privilege level",
      });
    }

    // Hash password
    const passwordHash = await hashPassword(body.password);

    const user = await store.createUser(request.currentUser.tenantId, {
      ...body,
      passwordHash,
      createdBy: request.currentUser.id,
    });

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "user.created",
      resourceNodeId: body.primaryOrgNodeId,
      outcome: "success",
      details: {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
    });

    // Remove sensitive fields
    const { passwordHash: _, ...safeUser } = user;
    return reply.code(201).send(safeUser);
  });

  // Update user
  app.patch("/v1/users/:id", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);

    // Check permission
    const isSelf = id === request.currentUser.id;
    if (
      !isSelf &&
      !(await hasPermissionForUser(request, store, "user:manage", id))
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }

    // Prevent self role/status change unless super_admin
    if (
      isSelf &&
      (body.role || body.status) &&
      request.currentUser.role !== "super_admin"
    ) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Cannot change own role or status",
      });
    }
    if (body.role && !canAssignRole(request.currentUser.role, body.role)) {
      return reply.code(403).send({
        error: "forbidden",
        message: "You cannot assign a role at or above your own privilege level",
      });
    }

    const user = await store.updateUser(id, body);

    if (!user || user.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "user.updated",
      resourceNodeId: null,
      outcome: "success",
      details: { userId: id, changes: body },
    });

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  });

  // Delete user (soft delete)
  app.delete("/v1/users/:id", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);

    // Check permission
    if (!(await hasPermissionForUser(request, store, "user:manage", id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    // Prevent self deletion
    if (id === request.currentUser.id) {
      return reply.code(400).send({
        error: "invalid_operation",
        message: "Cannot delete own account",
      });
    }

    await store.deactivateUser(id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "user.deleted",
      resourceNodeId: null,
      outcome: "success",
      details: { userId: id },
    });

    return reply.code(204).send();
  });

  // Assign user to organizational node
  app.post("/v1/users/:id/organizations", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);
    const body = assignOrgSchema.parse(request.body);

    // Check permission
    if (
      !(await hasPermissionForUser(request, store, "user:manage", id)) ||
      !(await hasPermission(request, store, "user:manage", body.scopeNodeId))
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const assignment = await store.assignUserToOrganization(
      id,
      body.scopeNodeId,
      body.isPrimary,
      request.currentUser.id,
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "user.organization_assigned",
      resourceNodeId: body.scopeNodeId,
      outcome: "success",
      details: { userId: id, isPrimary: body.isPrimary },
    });

    return reply.code(201).send(assignment);
  });

  // Remove organizational assignment
  app.delete(
    "/v1/users/:id/organizations/:nodeId",
    async (request, reply) => {
      const params = z
        .object({
          id: z.string().uuid(),
          nodeId: z.string().uuid(),
        })
        .parse(request.params);

      // Check permission
      if (
        !(await hasPermissionForUser(
          request,
          store,
          "user:manage",
          params.id,
        )) ||
        !(await hasPermission(request, store, "user:manage", params.nodeId))
      ) {
        return reply.code(403).send({ error: "forbidden" });
      }

      await store.removeUserOrganizationAssignment(params.id, params.nodeId);

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "user.organization_unassigned",
        resourceNodeId: params.nodeId,
        outcome: "success",
        details: { userId: params.id },
      });

      return reply.code(204).send();
    },
  );

  // Change password
  app.post("/v1/users/:id/change-password", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);
    const body = changePasswordSchema.parse(request.body);

    // Only self or super_admin can change password
    if (
      id !== request.currentUser.id &&
      request.currentUser.role !== "super_admin"
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const user = await store.getUserWithPassword(id);

    if (!user || user.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    // Verify current password (unless super_admin changing other's password)
    if (id === request.currentUser.id) {
      const isValid = await verifyPassword(
        body.currentPassword,
        user.passwordHash,
      );
      if (!isValid) {
        return reply.code(400).send({ error: "invalid_current_password" });
      }
    }

    // Hash new password
    const newPasswordHash = await hashPassword(body.newPassword);

    await store.updateUserPassword(id, newPasswordHash);
    await store.deleteAllUserSessions(id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "user.password_changed",
      resourceNodeId: null,
      outcome: "success",
      details: { userId: id },
    });

    return { success: true };
  });

  // Reset password (admin only)
  app.post("/v1/users/:id/reset-password", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);
    const body = resetPasswordSchema.parse(request.body);

    // Check permission
    if (!(await hasPermissionForUser(request, store, "user:manage", id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const user = await store.getUserDetails(id);

    if (!user || user.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    // Hash new password
    const passwordHash = await hashPassword(body.newPassword);

    await store.updateUserPassword(id, passwordHash, true); // Force password change on next login
    await store.deleteAllUserSessions(id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "user.password_reset",
      resourceNodeId: null,
      outcome: "success",
      details: { userId: id },
    });

    return { success: true };
  });

  // Unlock user account
  app.post("/v1/users/:id/unlock", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);

    // Check permission
    if (!(await hasPermissionForUser(request, store, "user:manage", id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await store.unlockUserAccount(id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "user.unlocked",
      resourceNodeId: null,
      outcome: "success",
      details: { userId: id },
    });

    return { success: true };
  });

  // Get user camera access overview
  app.get("/v1/users/:id/camera-access", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);

    // Check permission
    if (
      id !== request.currentUser.id &&
      !(await hasPermissionForUser(request, store, "user:manage", id))
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const accessOverview = await store.getUserCameraAccessOverview(id);

    if (!accessOverview) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    return accessOverview;
  });

  // Get user audit log
  app.get("/v1/users/:id/audit-log", async (request, reply) => {
    const { id } = userIdSchema.parse(request.params);
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);

    // Check permission
    if (
      id !== request.currentUser.id &&
      !(await hasPermissionForUser(request, store, "audit:view", id))
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const auditLog = await store.getUserAuditLog(id, query.limit, query.offset);

    return auditLog;
  });
}

async function hasPermission(
  request: FastifyRequest,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string,
): Promise<boolean> {
  const decision = await store.checkAccess(
    request.currentUser,
    action as any,
    resourceNodeId,
  );

  return decision?.allowed || false;
}

async function hasPermissionForUser(
  request: FastifyRequest,
  store: ControlPlaneStore & UserManagementStore,
  action: string,
  targetUserId: string,
): Promise<boolean> {
  const target = await store.getUserDetails(targetUserId);
  if (!target || target.tenantId !== request.currentUser.tenantId) return false;
  if (!canManageRole(request.currentUser.role, target.role)) return false;
  const primary = target.organizations?.find(
    (assignment: any) => assignment.isPrimary,
  ) ?? target.organizations?.[0];
  if (!primary?.scopeNodeId) return false;
  return hasPermission(request, store, action, primary.scopeNodeId);
}

const roleRank = {
  viewer: 10,
  operator: 20,
  security_officer: 25,
  auditor: 30,
  branch_manager: 40,
  area_manager: 50,
  region_manager: 60,
  zone_manager: 70,
  hq_admin: 80,
  company_admin: 90,
  super_admin: 100,
} as const;

function canAssignRole(
  actorRole: keyof typeof roleRank | undefined,
  targetRole: keyof typeof roleRank,
) {
  if (!actorRole) return false;
  if (actorRole === "super_admin") return true;
  return roleRank[actorRole] > roleRank[targetRole];
}

function canManageRole(
  actorRole: keyof typeof roleRank | undefined,
  targetRole: keyof typeof roleRank | undefined,
) {
  if (!actorRole || !targetRole) return false;
  if (actorRole === "super_admin") return true;
  return roleRank[actorRole] > roleRank[targetRole];
}
