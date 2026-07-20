import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  CameraPermissionStore,
  ControlPlaneStore,
} from "../control-plane-store.js";

const cameraSpecificGrantSchema = z.object({
  userId: z.string().uuid(),
  cameraId: z.string().uuid(),
  effect: z.enum(["allow", "deny"]),
  reason: z.string().max(500).optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});

const cameraAccessRequestSchema = z.object({
  cameraId: z.string().uuid(),
  justification: z.string().min(10).max(1000),
  requestedFrom: z.string().datetime(),
  requestedUntil: z.string().datetime(),
}).refine(
  (value) => new Date(value.requestedUntil) > new Date(value.requestedFrom),
  { message: "requestedUntil must be after requestedFrom", path: ["requestedUntil"] },
);

const reviewAccessRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNotes: z.string().max(1000).optional(),
});

const timeRestrictionSchema = z.object({
  cameraId: z.string().uuid().optional(),
  scopeNodeId: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  timeFrom: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  timeUntil: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  effect: z.enum(["allow", "deny"]),
  description: z.string().max(500).optional(),
}).refine(
  (value) => Boolean(value.cameraId) !== Boolean(value.scopeNodeId),
  { message: "Provide exactly one of cameraId or scopeNodeId" },
);

const accessGroupSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().max(1000).optional(),
  scopeNodeId: z.string().uuid().optional(),
});

const updateCameraSensitivitySchema = z.object({
  sensitivityLevel: z.enum([
    "public",
    "internal",
    "restricted",
    "highly_restricted",
    "sensitive",
  ]),
  requiresApproval: z.boolean().optional(),
  accessJustificationRequired: z.boolean().optional(),
  autoDenyRoles: z.array(z.string()).optional(),
  allowedRoles: z.array(z.string()).optional(),
});

export async function registerCameraPermissionRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore & CameraPermissionStore,
) {
  // ===== Camera-Specific Grants =====

  // List camera-specific grants for a user
  app.get("/v1/users/:userId/camera-grants", async (request, reply) => {
    const params = z.object({ userId: z.string().uuid() }).parse(request.params);

    // Check permission
    if (
      params.userId !== request.currentUser.id &&
      !(await hasPermission(request, store, "user:manage"))
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const grants = await store.listCameraSpecificGrants(params.userId);
    return { data: grants };
  });

  // List camera-specific grants for a camera
  app.get("/v1/cameras/:cameraId/grants", async (request, reply) => {
    const params = z.object({ cameraId: z.string().uuid() }).parse(request.params);
    const camera = await store.getCamera(params.cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });

    if (!(await hasPermission(request, store, "device:configure", camera.nodeId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const grants = await store.listCameraGrants(params.cameraId);
    return { data: grants };
  });

  // Grant or deny camera access to user
  app.post("/v1/camera-grants", async (request, reply) => {
    const body = cameraSpecificGrantSchema.parse(request.body);
    const camera = await store.getCamera(body.cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });

    if (!(await hasPermission(request, store, "device:configure", camera.nodeId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const grant = await store.createCameraSpecificGrant(
      request.currentUser.tenantId,
      body,
      request.currentUser.id,
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.grant_created",
      resourceNodeId: null,
      outcome: "success",
      details: {
        grantId: grant.id,
        userId: body.userId,
        cameraId: body.cameraId,
        effect: body.effect,
      },
    });

    return reply.code(201).send(grant);
  });

  // Revoke camera-specific grant
  app.delete("/v1/camera-grants/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    // Check permission
    if (!(await hasPermission(request, store, "device:configure"))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await store.deleteCameraSpecificGrant(params.id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.grant_revoked",
      resourceNodeId: null,
      outcome: "success",
      details: { grantId: params.id },
    });

    return reply.code(204).send();
  });

  // ===== Camera Access Requests =====

  // List access requests (for approval)
  app.get("/v1/camera-access-requests", async (request) => {
    const query = z
      .object({
        status: z
          .enum(["pending", "approved", "rejected", "expired", "revoked"])
          .optional(),
        userId: z.string().uuid().optional(),
        cameraId: z.string().uuid().optional(),
      })
      .parse(request.query);

    // Check permission
    if (!(await hasPermission(request, store, "device:configure"))) {
      return { data: [] };
    }

    const requests = await store.listCameraAccessRequests(
      request.currentUser.tenantId,
      query,
    );

    return { data: requests };
  });

  // Get my access requests
  app.get("/v1/me/camera-access-requests", async (request) => {
    const requests = await store.listCameraAccessRequests(
      request.currentUser.tenantId,
      { userId: request.currentUser.id },
    );

    return { data: requests };
  });

  // Request camera access
  app.post("/v1/camera-access-requests", async (request, reply) => {
    const body = cameraAccessRequestSchema.parse(request.body);

    // Check if camera exists and get details
    const camera = await store.getCamera(body.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }
    const cameraNode = await store.getNode(camera.nodeId);
    if (cameraNode?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    // Check if user already has active request
    const existingRequests = await store.listCameraAccessRequests(
      request.currentUser.tenantId,
      {
        userId: request.currentUser.id,
        cameraId: body.cameraId,
        status: "pending",
      },
    );

    if (existingRequests.length > 0) {
      return reply.code(400).send({
        error: "duplicate_request",
        message: "You already have a pending request for this camera",
      });
    }

    const accessRequest = await store.createCameraAccessRequest(
      request.currentUser.tenantId,
      request.currentUser.id,
      body,
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.access_requested",
      resourceNodeId: null,
      outcome: "success",
      details: {
        requestId: accessRequest.id,
        cameraId: body.cameraId,
      },
    });

    return reply.code(201).send(accessRequest);
  });

  // Review access request
  app.post(
    "/v1/camera-access-requests/:id/review",
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = reviewAccessRequestSchema.parse(request.body);
      const pendingRequest = await store.getCameraAccessRequest(params.id);
      if (!pendingRequest) {
        return reply.code(404).send({ error: "request_not_found" });
      }
      const camera = await store.getCamera(pendingRequest.cameraId);
      if (!camera) return reply.code(404).send({ error: "camera_not_found" });

      if (!(await hasPermission(request, store, "device:configure", camera.nodeId))) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const accessRequest = await store.reviewCameraAccessRequest(
        params.id,
        request.currentUser.id,
        body.status,
        body.reviewNotes,
      );

      if (!accessRequest) {
        return reply.code(404).send({ error: "request_not_found" });
      }

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "camera.access_request_reviewed",
        resourceNodeId: null,
        outcome: "success",
        details: {
          requestId: params.id,
          decision: body.status,
        },
      });

      return accessRequest;
    },
  );

  // Revoke access request
  app.post("/v1/camera-access-requests/:id/revoke", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    // Check permission (owner or admin)
    const accessRequest = await store.getCameraAccessRequest(params.id);
    if (!accessRequest) {
      return reply.code(404).send({ error: "request_not_found" });
    }

    if (
      accessRequest.userId !== request.currentUser.id &&
      !(await canConfigureCamera(
        request,
        store,
        accessRequest.cameraId,
      ))
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await store.revokeCameraAccessRequest(params.id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.access_request_revoked",
      resourceNodeId: null,
      outcome: "success",
      details: { requestId: params.id },
    });

    return reply.code(204).send();
  });

  // ===== Time-Based Restrictions =====

  // List time restrictions
  app.get("/v1/time-restrictions", async (request) => {
    const query = z
      .object({
        cameraId: z.string().uuid().optional(),
        scopeNodeId: z.string().uuid().optional(),
      })
      .parse(request.query);

    // Check permission
    if (!(await hasPermission(request, store, "device:configure"))) {
      return { data: [] };
    }

    const restrictions = await store.listTimeBasedRestrictions(
      request.currentUser.tenantId,
      query,
    );

    return { data: restrictions };
  });

  // Create time restriction
  app.post("/v1/time-restrictions", async (request, reply) => {
    const body = timeRestrictionSchema.parse(request.body);
    const resourceNodeId = body.cameraId
      ? (await store.getCamera(body.cameraId))?.nodeId
      : body.scopeNodeId;
    if (!resourceNodeId) {
      return reply.code(404).send({ error: "resource_not_found" });
    }

    if (!(await hasPermission(request, store, "device:configure", resourceNodeId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const restriction = await store.createTimeBasedRestriction(
      request.currentUser.tenantId,
      body,
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.time_restriction_created",
      resourceNodeId: body.scopeNodeId || null,
      outcome: "success",
      details: { restrictionId: restriction.id },
    });

    return reply.code(201).send(restriction);
  });

  // Delete time restriction
  app.delete("/v1/time-restrictions/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    // Check permission
    if (!(await hasPermission(request, store, "device:configure"))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await store.deleteTimeBasedRestriction(params.id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.time_restriction_deleted",
      resourceNodeId: null,
      outcome: "success",
      details: { restrictionId: params.id },
    });

    return reply.code(204).send();
  });

  // ===== Camera Access Groups =====

  // List access groups
  app.get("/v1/camera-access-groups", async (request) => {
    const query = z
      .object({
        scopeNodeId: z.string().uuid().optional(),
      })
      .parse(request.query);

    const groups = await store.listCameraAccessGroups(
      request.currentUser.tenantId,
      query.scopeNodeId,
    );

    return { data: groups };
  });

  // Get access group details
  app.get("/v1/camera-access-groups/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    const group = await store.getCameraAccessGroupDetails(params.id);

    if (!group || group.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "group_not_found" });
    }

    return group;
  });

  // Create access group
  app.post("/v1/camera-access-groups", async (request, reply) => {
    const body = accessGroupSchema.parse(request.body);

    if (!(await hasPermission(
      request,
      store,
      "device:configure",
      body.scopeNodeId,
    ))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const group = await store.createCameraAccessGroup(
      request.currentUser.tenantId,
      body,
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.access_group_created",
      resourceNodeId: body.scopeNodeId || null,
      outcome: "success",
      details: { groupId: group.id, name: body.name },
    });

    return reply.code(201).send(group);
  });

  // Add camera to access group
  app.post("/v1/camera-access-groups/:id/cameras", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ cameraId: z.string().uuid() }).parse(request.body);
    const camera = await store.getCamera(body.cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });

    if (!(await hasPermission(request, store, "device:configure", camera.nodeId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await store.addCameraToAccessGroup(
      params.id,
      body.cameraId,
      request.currentUser.id,
    );

    return reply.code(201).send({ success: true });
  });

  // Remove camera from access group
  app.delete(
    "/v1/camera-access-groups/:id/cameras/:cameraId",
    async (request, reply) => {
      const params = z
        .object({
          id: z.string().uuid(),
          cameraId: z.string().uuid(),
        })
        .parse(request.params);

      const camera = await store.getCamera(params.cameraId);
      if (!camera) return reply.code(404).send({ error: "camera_not_found" });
      if (!(await hasPermission(request, store, "device:configure", camera.nodeId))) {
        return reply.code(403).send({ error: "forbidden" });
      }

      await store.removeCameraFromAccessGroup(params.id, params.cameraId);

      return reply.code(204).send();
    },
  );

  // Assign user to access group
  app.post("/v1/camera-access-groups/:id/users", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        userId: z.string().uuid(),
        effect: z.enum(["allow", "deny"]).default("allow"),
      })
      .parse(request.body);

    // Check permission
    if (!(await hasPermission(request, store, "device:configure"))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await store.assignUserToAccessGroup(
      params.id,
      body.userId,
      body.effect,
      request.currentUser.id,
    );

    return reply.code(201).send({ success: true });
  });

  // Remove user from access group
  app.delete(
    "/v1/camera-access-groups/:id/users/:userId",
    async (request, reply) => {
      const params = z
        .object({
          id: z.string().uuid(),
          userId: z.string().uuid(),
        })
        .parse(request.params);

      // Check permission
      if (!(await hasPermission(request, store, "device:configure"))) {
        return reply.code(403).send({ error: "forbidden" });
      }

      await store.removeUserFromAccessGroup(params.id, params.userId);

      return reply.code(204).send();
    },
  );

  // ===== Camera Sensitivity Configuration =====

  // Update camera sensitivity settings
  app.patch("/v1/cameras/:id/sensitivity", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateCameraSensitivitySchema.parse(request.body);
    const existing = await store.getCamera(params.id);
    if (!existing) return reply.code(404).send({ error: "camera_not_found" });

    if (!(await hasPermission(request, store, "device:configure", existing.nodeId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const camera = await store.updateCameraSensitivity(params.id, body);

    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.sensitivity_updated",
      resourceNodeId: null,
      outcome: "success",
      details: {
        cameraId: params.id,
        sensitivityLevel: body.sensitivityLevel,
      },
    });

    return camera;
  });

  // Check camera access for current user
  app.get("/v1/cameras/:id/check-access", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z
      .object({
        action: z.string().default("live:view"),
      })
      .parse(request.query);

    const accessCheck = await store.checkCameraAccess(
      request.currentUser.id,
      params.id,
      query.action,
    );

    return accessCheck;
  });

  // Get camera access summary
  app.get("/v1/cameras/:id/access-summary", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const camera = await store.getCamera(params.id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });

    if (!(await hasPermission(request, store, "device:configure", camera.nodeId))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const summary = await store.getCameraAccessSummary(params.id);

    if (!summary) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    return summary;
  });
}

async function hasPermission(
  request: FastifyRequest,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId?: string,
): Promise<boolean> {
  if (resourceNodeId) {
    return Boolean(
      (await store.checkAccess(
        request.currentUser,
        action as any,
        resourceNodeId,
      ))?.allowed,
    );
  }
  return (
    request.currentUser.role === "super_admin" ||
    request.currentUser.role === "company_admin"
  );
}

async function canConfigureCamera(
  request: FastifyRequest,
  store: ControlPlaneStore,
  cameraId: string,
) {
  const camera = await store.getCamera(cameraId);
  return camera
    ? hasPermission(request, store, "device:configure", camera.nodeId)
    : false;
}
