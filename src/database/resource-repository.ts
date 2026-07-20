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

  async findById(id: string): Promise<ResourceNode | undefined> {
    const result = await this.pool.query<ResourceRow>(
      `SELECT id::text, parent_id::text, tenant_id::text, node_type, name,
              path::text
       FROM resource_nodes WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapNode(result.rows[0]) : undefined;
  }

  async checkAccess(
    user: User,
    action: Action,
    resourceNodeId: string,
  ): Promise<AuthorizationDecision | undefined> {
    const target = await this.pool.query<{ tenant_id: string }>(
      "SELECT tenant_id::text FROM resource_nodes WHERE id = $1",
      [resourceNodeId],
    );
    if (!target.rows[0]) return undefined;
    if (target.rows[0].tenant_id !== user.tenantId) {
      return { allowed: false, reason: "no_matching_grant" };
    }

    const result = await this.pool.query<{
      effect: "allow" | "deny";
      scope_node_id: string;
    }>(
      `SELECT g.effect, g.scope_node_id::text
       FROM access_grants g
       JOIN resource_nodes scope ON scope.id = g.scope_node_id
       JOIN resource_nodes target ON target.id = $3
       WHERE g.user_id = $1
         AND g.action = $2
         AND g.tenant_id = target.tenant_id
         AND target.path <@ scope.path
         AND (g.valid_from IS NULL OR g.valid_from <= now())
         AND (g.valid_until IS NULL OR g.valid_until > now())
       ORDER BY CASE WHEN g.effect = 'deny' THEN 0 ELSE 1 END
       LIMIT 1`,
      [user.id, action, resourceNodeId],
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
  ): Promise<ResourceNode[]> {
    const result = await this.pool.query<ResourceRow>(
      `SELECT DISTINCT target.id::text, target.parent_id::text,
              target.tenant_id::text, target.node_type, target.name,
              target.path::text
       FROM resource_nodes target
       WHERE target.tenant_id = $1
         AND ($4::resource_node_type IS NULL OR target.node_type = $4)
         AND EXISTS (
           SELECT 1
           FROM access_grants grant_allow
           JOIN resource_nodes allow_scope
             ON allow_scope.id = grant_allow.scope_node_id
           WHERE grant_allow.user_id = $2
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
           WHERE grant_deny.user_id = $2
             AND grant_deny.action = $3
             AND grant_deny.effect = 'deny'
             AND target.path <@ deny_scope.path
             AND (grant_deny.valid_from IS NULL OR grant_deny.valid_from <= now())
             AND (grant_deny.valid_until IS NULL OR grant_deny.valid_until > now())
         )
       ORDER BY target.name`,
      [user.tenantId, user.id, action, type ?? null],
    );
    return result.rows.map(mapNode);
  }

  async createBranch(
    tenantId: string,
    parentNodeId: string,
    name: string,
  ): Promise<ResourceNode> {
    const result = await this.pool.query<ResourceRow>(
      `WITH parent AS (
         SELECT id, tenant_id, path
         FROM resource_nodes
         WHERE id = $2 AND tenant_id = $1
       ), new_id AS (
         SELECT gen_random_uuid() AS id
       )
       INSERT INTO resource_nodes
         (id, tenant_id, parent_id, node_type, name, path)
       SELECT new_id.id, parent.tenant_id, parent.id, 'branch', $3,
              parent.path || text2ltree(replace(new_id.id::text, '-', '_'))
       FROM parent, new_id
       RETURNING id::text, parent_id::text, tenant_id::text, node_type, name,
                 path::text`,
      [tenantId, parentNodeId, name],
    );
    if (!result.rows[0]) throw new Error("invalid_parent");
    return mapNode(result.rows[0]);
  }
}
