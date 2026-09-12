/**
 * Database Domain Module
 * 
 * Manages PostgreSQL connection pool lifecycle and registers health with ModuleRegistry.
 */

import { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";

export class DatabaseModule {
  private pool: Pool | null = null;

  async initialize(connectionString?: string): Promise<Pool> {
    const connStr = connectionString || process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/sentinel_grid";

    moduleRegistry.registerModule({
      module: "database",
      importance: "CRITICAL",
      state: "STARTING",
      reason: "Initializing PostgreSQL connection pool",
    });

    try {
      this.pool = new Pool({
        connectionString: connStr,
        max: Number(process.env.DB_POOL_MAX || 20),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();

      moduleRegistry.updateModuleState("database", "READY", "Connected to PostgreSQL database");
      return this.pool;
    } catch (err: any) {
      moduleRegistry.updateModuleState(
        "database",
        "UNAVAILABLE",
        `PostgreSQL initialization failed: ${err.message}`
      );
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
      return this.pool || new Pool();
    }
  }

  getPool(): Pool | null {
    return this.pool;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      moduleRegistry.updateModuleState("database", "UNAVAILABLE", "Database connection closed");
    }
  }
}

export const databaseModule = new DatabaseModule();
