/**
 * Statistics Integration
 * Connects analytics-engine to control plane database for statistics queries
 */

import { Pool } from "pg";
import { AnalyticsStatisticsRepository } from "./repositories/analytics-statistics.repository.js";
import { AnalyticsStatisticsService } from "./services/analytics-statistics.service.js";

let statisticsService: AnalyticsStatisticsService | null = null;
let statisticsPool: Pool | null = null;

/**
 * Initialize statistics service with control plane database connection
 * 
 * This should be called during analytics-engine startup if DATABASE_URL is available.
 * The statistics endpoint requires access to the control plane's analytics_events table.
 */
export async function initializeStatisticsService(databaseUrl?: string): Promise<void> {
  // Use DATABASE_URL environment variable if not provided
  const connectionString = databaseUrl ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn(
      "[Statistics] DATABASE_URL not configured. Statistics endpoint will be unavailable."
    );
    return;
  }

  try {
    // Parse connection string to check if SSL is required
    const isExternalDatabase =
      connectionString.includes("render.com") ||
      connectionString.includes("heroku.com") ||
      connectionString.includes("aws.com");

    statisticsPool = new Pool({
      connectionString,
      max: parseInt(process.env.STATISTICS_DB_POOL_MAX ?? "5"),
      min: 1,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
      query_timeout: 20_000,
      application_name: "analytics-engine-statistics",
      ssl: isExternalDatabase
        ? {
            rejectUnauthorized: false,
          }
        : false,
    });

    // Verify connection
    const client = await statisticsPool.connect();
    const result = await client.query("SELECT COUNT(*) FROM analytics_events LIMIT 1");
    client.release();

    // Initialize repository and service
    const repository = new AnalyticsStatisticsRepository(statisticsPool);
    statisticsService = new AnalyticsStatisticsService(repository);

    console.log("[Statistics] Successfully initialized with control plane database");
  } catch (error) {
    console.error("[Statistics] Failed to initialize:", error);
    
    // Clean up pool on failure
    if (statisticsPool) {
      await statisticsPool.end().catch(() => {});
      statisticsPool = null;
    }
    
    throw error;
  }
}

/**
 * Get the statistics service instance
 * Returns null if not initialized (DATABASE_URL not configured)
 */
export function getStatisticsService(): AnalyticsStatisticsService | null {
  return statisticsService;
}

/**
 * Get the statistics database pool
 * Returns null if not initialized
 */
export function getStatisticsPool(): Pool | null {
  return statisticsPool;
}

/**
 * Shutdown statistics service and close database connections
 */
export async function shutdownStatisticsService(): Promise<void> {
  if (statisticsPool) {
    console.log("[Statistics] Shutting down database pool...");
    await statisticsPool.end();
    statisticsPool = null;
    statisticsService = null;
  }
}
