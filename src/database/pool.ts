import { Pool } from "pg";

export function createPool(connectionString: string) {
  // Parse connection string to check if SSL is required (Render, Heroku, etc.)
  const isExternalDatabase = connectionString.includes('render.com') || 
                             connectionString.includes('heroku.com') ||
                             connectionString.includes('aws.com');
  
  return new Pool({
    connectionString,
    max: boundedNumber(process.env.DB_POOL_MAX, 20, 2, 200),
    min: boundedNumber(process.env.DB_POOL_MIN, 2, 0, 50),
    idleTimeoutMillis: boundedNumber(process.env.DB_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000),
    connectionTimeoutMillis: boundedNumber(process.env.DB_CONNECT_TIMEOUT_MS, 5_000, 500, 60_000),
    statement_timeout: boundedNumber(process.env.DB_STATEMENT_TIMEOUT_MS, 15_000, 1_000, 300_000),
    query_timeout: boundedNumber(process.env.DB_QUERY_TIMEOUT_MS, 20_000, 1_000, 300_000),
    application_name: "sentinel-control-plane",
    // Enable SSL for external managed databases
    ssl: isExternalDatabase ? {
      rejectUnauthorized: false // Render and similar services use self-signed certs
    } : false,
  });
}

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed))) : fallback;
}
