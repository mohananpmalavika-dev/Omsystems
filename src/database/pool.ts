import { Pool } from "pg";

export function createPool(connectionString: string) {
  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "sentinel-control-plane",
  });
}
