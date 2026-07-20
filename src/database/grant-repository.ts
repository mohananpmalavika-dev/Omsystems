import type { Pool } from "pg";
import type { AccessGrant, Action } from "../domain/models.js";

export class GrantRepository {
  constructor(private readonly pool: Pool) {}

  async listForUser(userId: string, action?: Action): Promise<AccessGrant[]> {
    const result = await this.pool.query<{
      user_id: string;
      scope_node_id: string;
      action: Action;
      effect: "allow" | "deny";
    }>(
      `SELECT user_id::text, scope_node_id::text, action, effect
       FROM access_grants
       WHERE user_id = $1
         AND ($2::text IS NULL OR action = $2)
         AND (valid_from IS NULL OR valid_from <= now())
         AND (valid_until IS NULL OR valid_until > now())`,
      [userId, action ?? null],
    );
    const grouped = new Map<string, AccessGrant>();
    for (const row of result.rows) {
      const key = `${row.user_id}:${row.scope_node_id}:${row.effect}`;
      const grant = grouped.get(key) ?? {
        userId: row.user_id,
        scopeNodeId: row.scope_node_id,
        actions: [],
        effect: row.effect,
      };
      grant.actions.push(row.action);
      grouped.set(key, grant);
    }
    return [...grouped.values()];
  }
}
