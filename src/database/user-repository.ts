import type { Pool } from "pg";
import type { User } from "../domain/models.js";

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByIdentity(identity: string): Promise<User | undefined> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      display_name: string;
    }>(
      `SELECT id::text, tenant_id::text, display_name
       FROM users
       WHERE active = true
         AND (identity_subject = $1 OR id::text = $1)
       LIMIT 1`,
      [identity],
    );
    const row = result.rows[0];
    return row
      ? { id: row.id, tenantId: row.tenant_id, displayName: row.display_name }
      : undefined;
  }
}
