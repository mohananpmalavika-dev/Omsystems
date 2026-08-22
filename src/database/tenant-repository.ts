import type { Pool } from "pg";

export class TenantRepository {
  constructor(private readonly pool: Pool) {}

  async create(slug: string, name: string) {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
    }>(
      `INSERT INTO tenants (slug, name)
       VALUES ($1, $2)
       RETURNING id::text, slug, name`,
      [slug, name],
    );
    return result.rows[0]!;
  }

  async findBySlug(slug: string) {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
    }>(
      "SELECT id::text, slug, name FROM tenants WHERE slug = $1",
      [slug],
    );
    return result.rows[0];
  }
}
