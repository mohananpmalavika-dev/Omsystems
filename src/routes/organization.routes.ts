import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  ControlPlaneStore,
  OrganizationStore,
  UserManagementStore,
} from "../control-plane-store.js";

const createNodeSchema = z.object({
  parentNodeId: z.string().min(1).optional(),
  nodeType: z.enum([
    "company",
    "headquarters",
    "zone",
    "division",
    "region",
    "area",
    "branch",
    "building",
    "floor",
    "location",
    "location-group",
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
  logoUrl: z.string().max(15_000_000).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  isSensitive: z.boolean().optional(),
  sensitivityLevel: z.enum(["normal", "restricted", "highly_restricted"]).optional(),
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
  logoUrl: z.string().max(15_000_000).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  isSensitive: z.boolean().optional(),
  sensitivityLevel: z.enum(["normal", "restricted", "highly_restricted"]).optional(),
});

const nodeIdSchema = z.object({ id: z.string().min(1) });

export async function registerOrganizationRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore & OrganizationStore & UserManagementStore,
) {
  // Get organizational hierarchy tree
  app.get("/v1/organization/tree", async (request) => {
    const tenantId = request.currentUser?.tenantId || "omsystems";
    let nodes: any[] = [];
    try {
      nodes = await store.getOrganizationTree(tenantId);
    } catch (err) {
      request.log.warn({ err, tenantId }, "Failed to fetch organization tree, returning empty tree");
      nodes = [];
    }
    const role = (request.currentUser?.role ?? "") as string;
    const isSuperOrAdmin =
      role === "super_admin" ||
      role === "company_admin" ||
      role === "superadmin" ||
      role === "hq_admin";

    let data = nodes;
    if (!isSuperOrAdmin) {
      const visible = await visibleOrganizationNodeIds(request, store).catch(() => new Set<string>());
      data = filterOrganizationTree(nodes, visible);
    }
    const organizationExists = nodes.length > 0;

    return {
      data,
      meta: {
        organizationExists,
        accessRestricted: organizationExists && data.length === 0,
        canCreateRoot: !organizationExists || isSuperOrAdmin,
      },
    };
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
            "division",
            "region",
            "area",
            "branch",
            "building",
            "floor",
            "location",
            "location-group",
            "camera-group",
          ])
          .optional(),
        parentId: z.string().min(1).optional(),
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
      // Creating root company node
      if (body.nodeType !== "company") {
        return reply.code(400).send({ 
          error: "invalid_node_type",
          message: "Only company nodes can be created without a parent" 
        });
      }

      // Check if user has permission to create root organization
      // Allow super_admin and company_admin to create the root organization
      if (
        request.currentUser.role !== "super_admin" &&
        request.currentUser.role !== "company_admin"
      ) {
        return reply.code(403).send({ 
          error: "forbidden",
          message: "Only super_admin or company_admin can create organization" 
        });
      }

      // Allow super_admin to create multiple client/organization roots
      if (request.currentUser.role !== "super_admin") {
        const existingNodes = await store.listOrganizationNodes(
          request.currentUser.tenantId,
          "company",
          undefined,
          false,
        );

        if (existingNodes.length > 0) {
          return reply.code(409).send({
            error: "organization_already_exists",
            message: "An organization already exists for this tenant. Only one company node is allowed per tenant.",
          });
        }
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

    // Authorization is default-deny. Give the root creator the role-derived
    // grants on the new root so the organization remains visible after setup.
    if (!body.parentNodeId) {
      await store.assignUserToOrganization(
        request.currentUser.id,
        node.id,
        true,
        request.currentUser.id,
      );
    }

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
    let id: string | undefined;
    
    try {
      ({ id } = nodeIdSchema.parse(request.params));

      // Check permission
      if (!(await requireAccess(request, reply, store, "org:manage", id))) {
        return;
      }

      // Get query parameters for cascade and force delete options
      const query = z
        .object({
          cascade: z.coerce.boolean().default(false),
          force: z.coerce.boolean().default(false),
        })
        .parse(request.query);

      // Check if node has active children
      const descendants = await store.getDescendantNodes(id, false);
      
      if (descendants.length > 0) {
        if (!query.cascade && !query.force) {
          // Get child types for better error message
          const childTypes = [...new Set(descendants.map(d => d.type))];
          const childCount = descendants.length;
          
          return reply.code(400).send({
            error: "node_has_active_children",
            message: `Cannot delete node with ${childCount} active children. Use ?cascade=true to delete all descendants, or deactivate children first.`,
            details: {
              childCount,
              childTypes,
              descendantIds: descendants.map(d => d.id),
              hint: "Add ?cascade=true to the URL to delete this node and all its descendants"
            }
          });
        }

        // Cascade delete: deactivate all descendants first (from leaf to root)
        if (query.cascade) {
          // Sort descendants by depth (deepest first) to avoid parent-child conflicts
          const sortedDescendants = [...descendants].sort((a, b) => {
            // Count path depth (more slashes = deeper)
            const depthA = (a.path?.match(/\//g) || []).length;
            const depthB = (b.path?.match(/\//g) || []).length;
            return depthB - depthA;
          });

          // Deactivate each descendant
          for (const descendant of sortedDescendants) {
            try {
              await store.deactivateOrganizationNode(descendant.id);
              
              await store.writeAudit({
                tenantId: request.currentUser.tenantId,
                actorUserId: request.currentUser.id,
                action: "organization.node_deleted",
                resourceNodeId: descendant.id,
                outcome: "success",
                details: {
                  cascadeDelete: true,
                  parentNodeId: id
                }
              });
            } catch (err) {
              console.error(`Failed to deactivate descendant ${descendant.id}:`, err);
              
              if (!query.force) {
                return reply.code(500).send({
                  error: "cascade_delete_failed",
                  message: `Failed to delete descendant node ${descendant.name} (${descendant.id})`,
                  details: {
                    failedNodeId: descendant.id,
                    failedNodeName: descendant.name,
                    error: err instanceof Error ? err.message : String(err)
                  }
                });
              }
              // If force=true, continue despite errors
            }
          }
        }
      }

      // Now deactivate the requested node
      await store.deactivateOrganizationNode(id);

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "organization.node_deleted",
        resourceNodeId: id,
        outcome: "success",
        details: {
          cascadeDelete: query.cascade,
          descendantsDeleted: descendants.length
        }
      });

      return reply.code(204).send();
      
    } catch (error) {
      console.error("Error deleting organization node:", error);
      
      // Log detailed error for debugging
      console.error("Delete error details:", {
        nodeId: id || 'unknown',
        userId: request.currentUser.id,
        tenantId: request.currentUser.tenantId,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : String(error)
      });

      // Return detailed error to client
      return reply.code(500).send({
        error: "delete_failed",
        message: error instanceof Error ? error.message : "Failed to delete organization node",
        details: {
          nodeId: id || 'unknown',
          timestamp: new Date().toISOString(),
          errorType: error instanceof Error ? error.name : typeof error
        }
      });
    }
  });

  // Validate hierarchy relationship
  app.post("/v1/organization/validate-hierarchy", async (request, reply) => {
    const body = z
      .object({
        parentNodeId: z.string().min(1),
        childNodeType: z.enum([
          "company",
          "headquarters",
          "zone",
          "region",
          "area",
          "branch",
          "floor",
          "location",
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
