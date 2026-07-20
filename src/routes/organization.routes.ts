import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  ControlPlaneStore,
  OrganizationStore,
} from "../control-plane-store.js";

const createNodeSchema = z.object({
  parentNodeId: z.string().uuid().optional(),
  nodeType: z.enum([
    "company",
    "headquarters",
    "zone",
    "region",
    "area",
    "branch",
    "camera-group",
  ]),
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().min(1).max(50).optional(),
  description: z.string().max(1000).optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  contactInfo: z
    .object({
      phone: z.string().optional(),
      email: z.string().email().optional(),
      contactPerson: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateNodeSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  description: z.string().max(1000).optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  contactInfo: z
    .object({
      phone: z.string().optional(),
      email: z.string().email().optional(),
      contactPerson: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const nodeIdSchema = z.object({ id: z.string().uuid() });

export async function registerOrganizationRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore & OrganizationStore,
) {
  // Get organizational hierarchy tree
  app.get("/v1/organization/tree", async (request) => {
    const tenantId = request.currentUser.tenantId;
    const nodes = await store.getOrganizationTree(tenantId);
    const visible = await visibleOrganizationNodeIds(request, store);
    return { data: filterOrganizationTree(nodes, visible) };
  });

  // Get organization statistics
  app.get("/v1/organization/statistics", async (request) => {
    if (
      request.currentUser.role === "super_admin" ||
      request.currentUser.role === "company_admin"
    ) {
      return store.getOrganizationStatistics(request.currentUser.tenantId);
    }
    const visibleNodes = await visibleOrganizationNodes(request, store);
    const counts: Record<string, number> = {};
    for (const node of visibleNodes) {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
    }
    return {
      nodes: counts,
      cameras: {
        total: counts.camera ?? 0,
        online: null,
      },
    };
  });

  // List all nodes by type
  app.get("/v1/organization/nodes", async (request) => {
    const query = z
      .object({
        type: z
          .enum([
            "company",
            "headquarters",
            "zone",
            "region",
            "area",
            "branch",
            "camera-group",
          ])
          .optional(),
        parentId: z.string().uuid().optional(),
        includeInactive: z.coerce.boolean().default(false),
      })
      .parse(request.query);

    const nodes = await store.listOrganizationNodes(
      request.currentUser.tenantId,
      query.type,
      query.parentId,
      query.includeInactive,
    );
    const visible = await visibleOrganizationNodeIds(request, store);
    return { data: nodes.filter((node) => visible.has(node.id)) };
  });

  // Get node by ID with details
  app.get("/v1/organization/nodes/:id", async (request, reply) => {
    const { id } = nodeIdSchema.parse(request.params);
    const node = await store.getOrganizationNodeDetails(id);

    if (!node) {
      return reply.code(404).send({ error: "node_not_found" });
    }

    if (node.tenantId !== request.currentUser.tenantId) {
      return reply.code(403).send({ error: "forbidden" });
    }
    if (!(await canReadOrganizationNode(request, store, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return node;
  });

  // Get node hierarchy path (from node to root)
  app.get("/v1/organization/nodes/:id/path", async (request, reply) => {
    const { id } = nodeIdSchema.parse(request.params);
    if (!(await canReadOrganizationNode(request, store, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const path = await store.getNodeHierarchyPath(id);

    if (!path || path.length === 0) {
      return reply.code(404).send({ error: "node_not_found" });
    }

    return { data: path };
  });

  // Get descendant nodes
  app.get("/v1/organization/nodes/:id/descendants", async (request, reply) => {
    const { id } = nodeIdSchema.parse(request.params);
    if (!(await canReadOrganizationNode(request, store, id))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const query = z
      .object({
        includeInactive: z.coerce.boolean().default(false),
      })
      .parse(request.query);

    const descendants = await store.getDescendantNodes(
      id,
      query.includeInactive,
    );
    const visible = await visibleOrganizationNodeIds(request, store);
    return { data: descendants.filter((node) => visible.has(node.id)) };
  });

  // Create organization node
  app.post("/v1/organization/nodes", async (request, reply) => {
    const body = createNodeSchema.parse(request.body);

    // Check permission
    if (!body.parentNodeId) {
      if (
        body.nodeType !== "company" ||
        request.currentUser.role !== "super_admin"
      ) {
        return reply.code(403).send({ error: "forbidden" });
      }
    } else if (
      !(await requireAccess(
        request,
        reply,
        store,
        "org:manage",
        body.parentNodeId,
      ))
    ) {
      return;
    }

    const node = await store.createOrganizationNode(
      request.currentUser.tenantId,
      body,
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "organization.node_created",
      resourceNodeId: node.id,
      outcome: "success",
      details: {
        nodeType: node.type,
        name: node.name,
      },
    });

    return reply.code(201).send(node);
  });

  // Update organization node
  app.patch("/v1/organization/nodes/:id", async (request, reply) => {
    const { id } = nodeIdSchema.parse(request.params);
    const body = updateNodeSchema.parse(request.body);

    // Check permission
    if (!(await requireAccess(request, reply, store, "org:manage", id))) {
      return;
    }

    const node = await store.updateOrganizationNode(id, body);

    if (!node) {
      return reply.code(404).send({ error: "node_not_found" });
    }

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "organization.node_updated",
      resourceNodeId: id,
      outcome: "success",
      details: body,
    });

    return node;
  });

  // Soft delete organization node
  app.delete("/v1/organization/nodes/:id", async (request, reply) => {
    const { id } = nodeIdSchema.parse(request.params);

    // Check permission
    if (!(await requireAccess(request, reply, store, "org:manage", id))) {
      return;
    }

    // Check if node has active children
    const descendants = await store.getDescendantNodes(id, false);
    if (descendants.length > 0) {
      return reply.code(400).send({
        error: "node_has_active_children",
        message:
          "Cannot delete node with active children. Deactivate children first.",
      });
    }

    await store.deactivateOrganizationNode(id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "organization.node_deleted",
      resourceNodeId: id,
      outcome: "success",
    });

    return reply.code(204).send();
  });

  // Validate hierarchy relationship
  app.post("/v1/organization/validate-hierarchy", async (request, reply) => {
    const body = z
      .object({
        parentNodeId: z.string().uuid(),
        childNodeType: z.enum([
          "company",
          "headquarters",
          "zone",
          "region",
          "area",
          "branch",
          "camera-group",
        ]),
      })
      .parse(request.body);

    if (
      !(await requireAccess(
        request,
        reply,
        store,
        "org:manage",
        body.parentNodeId,
      ))
    ) return;

    const isValid = await store.validateHierarchyRelationship(
      body.parentNodeId,
      body.childNodeType,
    );

    return { valid: isValid };
  });
}

async function visibleOrganizationNodes(
  request: FastifyRequest,
  store: ControlPlaneStore,
) {
  const actions = ["live:view", "audit:view", "org:manage"] as const;
  const lists = await Promise.all(
    actions.map((action) => store.listAccessibleNodes(request.currentUser, action)),
  );
  const byId = new Map<string, Awaited<ReturnType<ControlPlaneStore["getNode"]>> & {}>();
  for (const nodes of lists) {
    for (const node of nodes) byId.set(node.id, node);
  }
  return [...byId.values()];
}

async function visibleOrganizationNodeIds(
  request: FastifyRequest,
  store: ControlPlaneStore,
) {
  return new Set((await visibleOrganizationNodes(request, store)).map((node) => node.id));
}

async function canReadOrganizationNode(
  request: FastifyRequest,
  store: ControlPlaneStore,
  nodeId: string,
) {
  for (const action of ["live:view", "audit:view", "org:manage"] as const) {
    if ((await store.checkAccess(request.currentUser, action, nodeId))?.allowed) {
      return true;
    }
  }
  return false;
}

function filterOrganizationTree(nodes: any[], visible: Set<string>): any[] {
  return nodes.flatMap((node) => {
    const children = filterOrganizationTree(node.children ?? [], visible);
    if (!visible.has(node.id) && children.length === 0) return [];
    return [{ ...node, children }];
  });
}

async function requireAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string,
) {
  const decision = await store.checkAccess(
    request.currentUser,
    action as any,
    resourceNodeId,
  );

  if (!decision) {
    await reply.code(404).send({ error: "resource_not_found" });
    return false;
  }

  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return false;
  }

  return true;
}
