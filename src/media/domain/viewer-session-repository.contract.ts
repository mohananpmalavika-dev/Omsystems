import type { ViewerSession, ViewerTelemetry } from "./distributed-lease.types.js";

export interface ViewerSessionRepository {
  /**
   * Register or heartbeat a viewer session in Redis with TTL (default 60s).
   */
  registerSession(session: ViewerSession, ttlSeconds?: number): Promise<void>;

  /**
   * Retrieve an active viewer session by sessionId.
   */
  getSession(sessionId: string): Promise<ViewerSession | null>;

  /**
   * Update browser hardware decode telemetry and viewport state for a session.
   */
  updateTelemetry(telemetry: ViewerTelemetry, ttlSeconds?: number): Promise<void>;

  /**
   * Retrieve the latest telemetry for a session.
   */
  getTelemetry(sessionId: string): Promise<ViewerTelemetry | null>;

  /**
   * Heartbeat to extend session and telemetry TTLs.
   */
  heartbeat(sessionId: string, ttlSeconds?: number): Promise<boolean>;

  /**
   * Clean up when a viewer closes the browser tab or logs out.
   */
  removeSession(sessionId: string): Promise<void>;

  /**
   * List all active viewer sessions for a given user (across multi-monitors / devices).
   */
  listUserSessions(userId: string): Promise<ViewerSession[]>;
}
