/**
 * Database-backed Camera Credential Provider
 * For centralized management of 400+ locations and 4000+ cameras
 */

import pg from "pg";
import type { CameraCredential } from "./camera-credential-vault.js";

const { Client } = pg;

export class DatabaseCredentialProvider {
  private cache: Map<string, CameraCredential> = new Map();
  private lastFetch = 0;
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly databaseUrl: string,
    private readonly branchId: string,
    private readonly edgeAgentId: string
  ) {}

  async get(host: string): Promise<CameraCredential | undefined> {
    await this.refreshCacheIfNeeded();
    
    // Try host-specific credential first
    const hostKey = `host:${host}`;
    if (this.cache.has(hostKey)) {
      return this.cache.get(hostKey);
    }
    
    // Fall back to default branch credential
    return this.cache.get("default");
  }

  private async refreshCacheIfNeeded() {
    const now = Date.now();
    if (now - this.lastFetch < this.cacheTTL) {
      return; // Cache still valid
    }

    const client = new Client({
      connectionString: this.databaseUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    try {
      await client.connect();

      // Fetch credentials for this branch
      const result = await client.query(
        `SELECT username, password, scope, ip_address, updated_at
         FROM camera_credentials
         WHERE branch_id = $1 OR edge_agent_id = $2
         ORDER BY 
           CASE 
             WHEN ip_address IS NOT NULL THEN 1
             WHEN scope = 'default' THEN 3
             ELSE 2
           END`,
        [this.branchId, this.edgeAgentId]
      );

      this.cache.clear();

      for (const row of result.rows) {
        const credential: CameraCredential = {
          username: row.username,
          password: row.password,
          updatedAt: row.updated_at.toISOString(),
        };

        if (row.ip_address) {
          this.cache.set(`host:${row.ip_address}`, credential);
        } else {
          this.cache.set(row.scope || "default", credential);
        }
      }

      this.lastFetch = now;
    } catch (error) {
      // If DB fetch fails, keep using cached credentials
      console.error("Failed to fetch credentials from database:", error);
    } finally {
      await client.end();
    }
  }

  async set(input: { username: string; password: string; host?: string }): Promise<{
    scope: string;
    updatedAt: string;
  }> {
    const client = new Client({
      connectionString: this.databaseUrl,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();

      const result = await client.query(
        `INSERT INTO camera_credentials (branch_id, edge_agent_id, username, password, scope, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, updated_at`,
        [
          this.branchId,
          this.edgeAgentId,
          input.username,
          input.password,
          input.host ? "host-specific" : "default",
          input.host || null,
        ]
      );

      // Invalidate cache
      this.lastFetch = 0;

      return {
        scope: input.host ? "single-camera" : "branch-default",
        updatedAt: result.rows[0].updated_at.toISOString(),
      };
    } finally {
      await client.end();
    }
  }
}
