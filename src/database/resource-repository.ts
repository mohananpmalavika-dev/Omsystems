import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  Action,
  NodeType,
  ResourceNode,
  User,
} from "../domain/models.js";
import type { AuthorizationDecision } from "../domain/authorization.js";

type ResourceRow = {
  id: string;
  parent_id: string | null;
  tenant_id: string;
  node_type: NodeType;
  name: string;
  path: string;
};

function mapNode(row: ResourceRow): ResourceNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    tenantId: row.tenant_id,
    type: row.node_type,
    name: row.name,
    path: row.path.split(".").map((part) => part.replaceAll("_", "-")),
  };
}

export class ResourceRepository {
  constructor(private readonly pool: Pool) {}

  private async resolveTenantUuid(tenantIdOrSlug: string): Promise<string> {
    const slug = (tenantIdOrSlug || "omsystems").trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
      return slug;
    }
    const result = await this.pool.query(
      `SELECT id::text FROM tenants WHERE slug=$1 LIMIT 1`,
      [slug],
    );
    if (result.rows[0]?.id) {
      return result.rows[0].id;
    }
    const inserted = await this.pool.query(
      `INSERT INTO tenants (id, slug, name)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
       RETURNING id::text`,
      [slug, slug === "omsystems" ? "Sentinel Grid Enterprise" : slug],
    );
    return inserted.rows[0]!.id;
  }

  async findById(id: string): Promise<ResourceNode | undefined> {
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return undefined;
    }
    const result = await this.pool.query<ResourceRow>(
      `SELECT id::text, parent_id::text, tenant_id::text, node_type, name,
              path::text
       FROM resource_nodes WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapNode(result.rows[0]) : undefined;
  }

  async listByIds(ids: string[]): Promise<ResourceNode[]> {
    const validIds = ids.filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    );
    if (validIds.length === 0) return [];
    const result = await this.pool.query<ResourceRow>(
      `SELECT id::text, parent_id::text, tenant_id::text, node_type, name,
             path::text
       FROM resource_nodes WHERE id = ANY($1::uuid[])`,
      [validIds],
    );
    return result.rows.map(mapNode);
  }

  async checkAccess(
    user: User,
    action: Action,
    resourceNodeId: string,
  ): Promise<AuthorizationDecision | undefined> {
    const role = (user.role ?? "") as string;
    const isSuperAdmin =
      role === "super_admin" ||
      role === "superadmin" ||
      role === "company_admin";
    if (isSuperAdmin) {
      return { allowed: true, reason: "allowed_by_grant" };
    }

    if (
      !resourceNodeId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        resourceNodeId,
      )
    ) {
      return undefined;
    }

    const resolvedTenantId = await this.resolveTenantUuid(user.tenantId);
    const target = await this.pool.query<{ tenant_id: string }>(
      "SELECT tenant_id::text FROM resource_nodes WHERE id = $1",
      [resourceNodeId],
    );
    if (!target.rows[0]) return undefined;
    if (target.rows[0].tenant_id !== resolvedTenantId) {
      return { allowed: false, reason: "no_matching_grant" };
    }

    const resolvedUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      user.id,
    )
      ? user.id
      : "00000000-0000-4000-8000-000000000001";

    const result = await this.pool.query<{
      effect: "allow" | "deny";
      scope_node_id: string;
    }>(
      `SELECT g.effect, g.scope_node_id::text
       FROM access_grants g
       JOIN resource_nodes scope ON scope.id = g.scope_node_id
       JOIN resource_nodes target ON target.id = $3
       WHERE g.user_id = $1::uuid
         AND g.action = $2
         AND g.tenant_id = target.tenant_id
         AND target.path <@ scope.path
         AND (g.valid_from IS NULL OR g.valid_from <= now())
         AND (g.valid_until IS NULL OR g.valid_until > now())
       ORDER BY CASE WHEN g.effect = 'deny' THEN 0 ELSE 1 END
       LIMIT 1`,
      [resolvedUserId, action, resourceNodeId],
    );
    const grant = result.rows[0];
    if (!grant) return { allowed: false, reason: "no_matching_grant" };
    return grant.effect === "deny"
      ? {
          allowed: false,
          reason: "explicitly_denied",
          matchingScopeId: grant.scope_node_id,
        }
      : {
          allowed: true,
          reason: "allowed_by_grant",
          matchingScopeId: grant.scope_node_id,
        };
  }

  async listAccessible(
    user: User,
    action: Action,
    type?: NodeType,
    options?: { includeArchived?: boolean },
  ): Promise<ResourceNode[]> {
    const includeArchived = options?.includeArchived ?? false;
    const resolvedTenantId = await this.resolveTenantUuid(user.tenantId);
    const role = (user.role ?? "") as string;
    const isSuperAdmin =
      role === "super_admin" ||
      role === "superadmin" ||
      role === "company_admin";

    if (isSuperAdmin) {
      const result = await this.pool.query<ResourceRow>(
        `SELECT DISTINCT target.id::text, target.parent_id::text,
                target.tenant_id::text, target.node_type, target.name,
                target.path::text
         FROM resource_nodes target
         WHERE target.tenant_id = $1
           AND ($2::resource_node_type IS NULL OR target.node_type = $2)
           AND (
             target.node_type != 'branch' 
             OR $3::boolean = true
             OR target.lifecycle_status IS NULL
             OR target.lifecycle_status IN ('ACTIVE', 'DISABLED')
           )
         ORDER BY target.name`,
        [resolvedTenantId, type ?? null, includeArchived],
      );
      return result.rows.map(mapNode);
    }

    const resolvedUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      user.id,
    )
      ? user.id
      : "00000000-0000-4000-8000-000000000001";

    const result = await this.pool.query<ResourceRow>(
      `SELECT DISTINCT target.id::text, target.parent_id::text,
              target.tenant_id::text, target.node_type, target.name,
              target.path::text
       FROM resource_nodes target
       WHERE target.tenant_id = $1
         AND ($4::resource_node_type IS NULL OR target.node_type = $4)
         -- Lifecycle filter: exclude archived branches by default for operational queries
         AND (
           target.node_type != 'branch' 
           OR $5::boolean = true
           OR target.lifecycle_status IS NULL
           OR target.lifecycle_status IN ('ACTIVE', 'DISABLED')
         )
         AND EXISTS (
           SELECT 1
           FROM access_grants grant_allow
           JOIN resource_nodes allow_scope
             ON allow_scope.id = grant_allow.scope_node_id
           WHERE grant_allow.user_id = $2::uuid
             AND grant_allow.action = $3
             AND grant_allow.effect = 'allow'
             AND target.path <@ allow_scope.path
             AND (grant_allow.valid_from IS NULL OR grant_allow.valid_from <= now())
             AND (grant_allow.valid_until IS NULL OR grant_allow.valid_until > now())
         )
         AND NOT EXISTS (
           SELECT 1
           FROM access_grants grant_deny
           JOIN resource_nodes deny_scope
             ON deny_scope.id = grant_deny.scope_node_id
           WHERE grant_deny.user_id = $2::uuid
             AND grant_deny.action = $3
             AND grant_deny.effect = 'deny'
             AND target.path <@ deny_scope.path
             AND (grant_deny.valid_from IS NULL OR grant_deny.valid_from <= now())
             AND (grant_deny.valid_until IS NULL OR grant_deny.valid_until > now())
         )
       ORDER BY target.name`,
      [resolvedTenantId, resolvedUserId, action, type ?? null, includeArchived],
    );
    return result.rows.map(mapNode);
  }

  async createBranch(
    tenantId: string,
    parentNodeId: string,
    name: string,
  ): Promise<ResourceNode> {
    const resolvedTenantId = await this.resolveTenantUuid(tenantId);
    const parentRes = await this.pool.query<ResourceRow>(
      `SELECT id::text, path::text, tenant_id::text
       FROM resource_nodes
       WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [parentNodeId, resolvedTenantId],
    );
    const parent = parentRes.rows[0];
    if (!parent) throw new Error("invalid_parent");

    const id = randomUUID();
    const ltreeId = id.replaceAll("-", "_");
    const newPath = `${parent.path}.${ltreeId}`;

    const result = await this.pool.query<ResourceRow>(
      `INSERT INTO resource_nodes
         (id, tenant_id, parent_id, node_type, name, path, lifecycle_status)
       VALUES
         ($1::uuid, $2::uuid, $3::uuid, 'branch', $4::text, text2ltree($5), 'ACTIVE')
       RETURNING id::text, parent_id::text, tenant_id::text, node_type, name, path::text`,
      [id, resolvedTenantId, parent.id, name, newPath],
    );
    if (!result.rows[0]) throw new Error("failed_to_create_branch");
    return mapNode(result.rows[0]);
  }

  /**
   * List only active branches (for operational queries)
   */
  async listActiveBranches(tenantId: string): Promise<ResourceNode[]> {
    const resolvedTenantId = await this.resolveTenantUuid(tenantId);
    const result = await this.pool.query<ResourceRow>(
      `SELECT id::text, parent_id::text, tenant_id::text, node_type, name,
              path::text
       FROM resource_nodes
       WHERE tenant_id = $1
         AND node_type = 'branch'
         AND (lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL)
       ORDER BY name`,
      [resolvedTenantId],
    );
    return result.rows.map(mapNode);
  }

  /**
   * List operational branches (active and disabled, but not archived)
   */
  async listOperationalBranches(tenantId: string): Promise<ResourceNode[]> {
    const resolvedTenantId = await this.resolveTenantUuid(tenantId);
    const result = await this.pool.query<ResourceRow>(
      `SELECT id::text, parent_id::text, tenant_id::text, node_type, name,
              path::text
       FROM resource_nodes
       WHERE tenant_id = $1
         AND node_type = 'branch'
         AND (lifecycle_status IS NULL OR lifecycle_status IN ('ACTIVE', 'DISABLED'))
       ORDER BY name`,
      [resolvedTenantId],
    );
    return result.rows.map(mapNode);
  }

  /**
   * List all branches including archived (for administrative and audit queries)
   */
  async listAllBranches(tenantId: string): Promise<ResourceNode[]> {
    const resolvedTenantId = await this.resolveTenantUuid(tenantId);
    const result = await this.pool.query<ResourceRow>(
      `SELECT id::text, parent_id::text, tenant_id::text, node_type, name,
              path::text
       FROM resource_nodes
       WHERE tenant_id = $1
         AND node_type = 'branch'
       ORDER BY name`,
      [resolvedTenantId],
    );
    return result.rows.map(mapNode);
  }
}
