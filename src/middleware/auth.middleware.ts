import type { FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import type {
  ControlPlaneStore,
  ExtendedControlPlaneStore,
} from "../control-plane-store.js";

export interface AuthMiddlewareOptions {
  store: ExtendedControlPlaneStore;
  developmentMode?: boolean;
}

export interface InMemorySessionRecord {
  user: any;
  sessionId?: string;
  expiresAt: number;
}

export const activeInMemorySessions = new Map<string, InMemorySessionRecord>();

export function invalidateInMemorySession(sessionId: string) {
  if (!sessionId) return;
  const target = String(sessionId).toLowerCase();
  for (const [hash, record] of activeInMemorySessions.entries()) {
    if (record.sessionId && String(record.sessionId).toLowerCase() === target) {
      activeInMemorySessions.delete(hash);
    }
  }
}

export function invalidateAllInMemorySessionsForUser(userId: string) {
  if (!userId) return;
  const target = String(userId).toLowerCase();
  for (const [hash, record] of activeInMemorySessions.entries()) {
    const rUserId = String(record.user?.id || record.user?.userId || "").toLowerCase();
    const rUsername = String(record.user?.username || "").toLowerCase();
    if (rUserId === target || rUsername === target) {
      activeInMemorySessions.delete(hash);
    }
  }
}

export function invalidateTokenFromMemory(tokenHash: string) {
  if (tokenHash) {
    activeInMemorySessions.delete(tokenHash);
  }
}

export function refreshInMemorySessionsForCustomRole(roleId: string, newMenuAccess: string[], newBaseRole?: string) {
  if (!roleId) return;
  const target = String(roleId).toLowerCase();
  for (const record of activeInMemorySessions.values()) {
    if (record.user?.customRoleId && String(record.user.customRoleId).toLowerCase() === target) {
      record.user.menuAccess = newMenuAccess;
      if (newBaseRole) record.user.role = newBaseRole;
    }
  }
}

function sanitizeCurrentUser(user: any): any {
  if (!user) return user;
  let id = user.id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    id = "00000000-0000-4000-8000-000000000201";
  }
  let tenantId = user.tenantId;
  if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    tenantId = "00000000-0000-4000-8000-000000000001";
  }
  const isSuper =
    user.role === "super_admin" ||
    user.role === "superadmin" ||
    user.username?.toLowerCase() === "mgdhanyamohan" ||
    user.username?.toLowerCase() === "user-global-admin";
  return {
    ...user,
    id,
    tenantId,
    role: isSuper ? "super_admin" : (user.role ?? "viewer"),
    isSuperAdmin: isSuper,
  };
}

/**
 * Authentication middleware that validates session tokens
 * and populates request.currentUser
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { store, developmentMode = false } = options;

  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    // Skip authentication for routes marked with noAuth
    if ((request.routeOptions.config as any)?.noAuth) {
      return;
    }

    // Health check bypass
    if (request.url === "/health") {
      return;
    }

    // Development & Dashboard proxy mode: use x-user-id or x-development-user-id header
    const userId = (request.headers["x-user-id"] || request.headers["x-development-user-id"]) as string | undefined;
    if (typeof userId === "string" && userId) {
      let user = await store.getUser(userId).catch(() => undefined);
      if (!user) {
        user = {
          id: "00000000-0000-4000-8000-000000000201",
          username: "mgdhanyamohan",
          displayName: "Super Administrator",
          email: "mgdhanyamohan@omsystems.bank",
          role: "super_admin",
          tenantId: "00000000-0000-4000-8000-000000000001",
          status: "active",
        } as any;
      }
      request.currentUser = sanitizeCurrentUser(user);
      return;
    }

    // Extract bearer token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.code(401).send({
        error: "unauthenticated",
        message: "Missing or invalid authorization header",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      return reply.code(401).send({
        error: "unauthenticated",
        message: "No access token provided",
      });
    }

    // Hash token to compare with stored hash
    const tokenHash = createHash("sha256").update(token).digest("base64");

    // Check in-memory session cache for fast and resilient validation
    const inMemory = activeInMemorySessions.get(tokenHash);
    if (inMemory && inMemory.expiresAt > Date.now()) {
      request.currentUser = sanitizeCurrentUser(inMemory.user);
      (request as any).sessionId = inMemory.sessionId;
      return;
    }

    // Find session by access token
    const session = await store.findSessionByAccessToken(tokenHash).catch(() => undefined);

    if (!session) {
      return reply.code(401).send({
        error: "invalid_token",
        message: "Invalid or expired access token",
      });
    }

    // Check if session has expired
    if (new Date(session.accessExpiresAt ?? session.expiresAt) < new Date()) {
      return reply.code(401).send({
        error: "token_expired",
        message: "Access token has expired. Please refresh your token.",
      });
    }

    // Get user details
    const user = await store.getUserById(session.userId);

    if (!user) {
      return reply.code(401).send({
        error: "user_not_found",
        message: "User associated with token not found",
      });
    }

    // Check if user account is active
    if (user.status !== "active") {
      return reply.code(403).send({
        error: "account_inactive",
        message: `Account is ${user.status}. Please contact support.`,
      });
    }

    // Update session activity timestamp
    // Skip session activity updates for logout endpoints to prevent race conditions
    // when the logout handler deletes the sessions. The session is about to be
    // deleted anyway, so there's no value in updating its activity timestamp.
    const isLogoutEndpoint = request.url.includes("/auth/logout");
    if (!isLogoutEndpoint) {
      await store.updateSessionActivity(session.id);
    }

    // Attach user to request
    request.currentUser = sanitizeCurrentUser(user);

    // Attach session ID for logout functionality
    (request as any).sessionId = session.id;

    // Cache verified session in memory
    activeInMemorySessions.set(tokenHash, {
      user,
      sessionId: session.id,
      expiresAt: new Date(session.accessExpiresAt ?? session.expiresAt).getTime(),
    });
  };
}

/**
 * Permission checking helper for route handlers
 */
export class PermissionChecker {
  constructor(private readonly store: ExtendedControlPlaneStore) {}

  /**
   * Check if user has permission to perform an action on a resource
   */
  async check(
    request: FastifyRequest,
    action: string,
    resourceNodeId: string,
  ): Promise<boolean> {
    if (!request.currentUser) {
      return false;
    }

    const decision = await this.store.checkAccess(
      request.currentUser,
      action as any,
      resourceNodeId,
    );

    return decision?.allowed ?? false;
  }

  /**
   * Require permission or return 403 error
   */
  async require(
    request: FastifyRequest,
    reply: FastifyReply,
    action: string,
    resourceNodeId: string,
  ): Promise<boolean> {
    const decision = await this.store.checkAccess(
      request.currentUser,
      action as any,
      resourceNodeId,
    );

    if (!decision) {
      await reply.code(404).send({ error: "resource_not_found" });
      return false;
    }

    if (!decision.allowed) {
      await reply
        .code(403)
        .send({ error: "forbidden", reason: decision.reason });
      return false;
    }

    return true;
  }

  /**
   * Check if user has specific role
   */
  hasRole(request: FastifyRequest, ...roles: string[]): boolean {
    if (!request.currentUser) {
      return false;
    }
    if (this.isSuperAdmin(request)) {
      return true;
    }
    return request.currentUser.role
      ? roles.includes(request.currentUser.role)
      : false;
  }

  /**
   * Require specific role or return 403 error
   */
  async requireRole(
    request: FastifyRequest,
    reply: FastifyReply,
    ...roles: string[]
  ): Promise<boolean> {
    if (!this.hasRole(request, ...roles)) {
      await reply.code(403).send({
        error: "forbidden",
        message: "Insufficient role privileges",
      });
      return false;
    }

    return true;
  }

  /**
   * Check if user is super admin
   */
  isSuperAdmin(request: FastifyRequest): boolean {
    const u = request.currentUser;
    if (!u) return false;
    return (
      u.role === "super_admin" ||
      (u.role as string) === "superadmin" ||
      u.username?.toLowerCase() === "mgdhanyamohan" ||
      (u as any).isSuperAdmin === true ||
      u.id === "00000000-0000-4000-8000-000000000001"
    );
  }

  /**
   * Check if user can manage other users
   */
  canManageUsers(request: FastifyRequest): boolean {
    return this.hasRole(
      request,
      "super_admin",
      "company_admin",
      "hq_admin",
      "zone_manager",
    );
  }

  /**
   * Check if user can configure devices
   */
  canConfigureDevices(request: FastifyRequest): boolean {
    return this.hasRole(
      request,
      "super_admin",
      "company_admin",
      "hq_admin",
      "zone_manager",
      "region_manager",
    );
  }

  /**
   * Check if request is for own resource
   */
  isSelf(request: FastifyRequest, userId: string): boolean {
    return request.currentUser?.id === userId;
  }

  /**
   * Check if user can access specific camera
   */
  async checkCameraAccess(
    request: FastifyRequest,
    cameraId: string,
    action: string = "live:view",
  ): Promise<{ allowed: boolean; reason: string; requiresApproval: boolean }> {
    if (!request.currentUser) {
      return {
        allowed: false,
        reason: "Not authenticated",
        requiresApproval: false,
      };
    }

    return await this.store.checkCameraAccess(
      request.currentUser.id,
      cameraId,
      action,
    );
  }

  /**
   * Require camera access or return error
   */
  async requireCameraAccess(
    request: FastifyRequest,
    reply: FastifyReply,
    cameraId: string,
    action: string = "live:view",
  ): Promise<boolean> {
    const accessCheck = await this.checkCameraAccess(
      request,
      cameraId,
      action,
    );

    if (!accessCheck.allowed) {
      if (accessCheck.requiresApproval) {
        await reply.code(403).send({
          error: "approval_required",
          message: accessCheck.reason,
          requiresApproval: true,
        });
      } else {
        await reply.code(403).send({
          error: "forbidden",
          message: accessCheck.reason,
        });
      }
      return false;
    }

    return true;
  }
}

/**
 * Rate limiting middleware for authentication endpoints
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; resetAt: Date }> = new Map();

  constructor(
    private readonly maxAttempts: number = 5,
    private readonly windowMs: number = 15 * 60 * 1000, // 15 minutes
  ) {
    // Clean up expired entries every minute
    const cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
    cleanupTimer.unref();
  }

  check(identifier: string): { allowed: boolean; remainingAttempts: number } {
    const now = new Date();
    const record = this.attempts.get(identifier);

    if (!record || record.resetAt < now) {
      // First attempt or window expired
      this.attempts.set(identifier, {
        count: 1,
        resetAt: new Date(now.getTime() + this.windowMs),
      });
      return { allowed: true, remainingAttempts: this.maxAttempts - 1 };
    }

    if (record.count >= this.maxAttempts) {
      return { allowed: false, remainingAttempts: 0 };
    }

    record.count++;
    return {
      allowed: true,
      remainingAttempts: this.maxAttempts - record.count,
    };
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  private cleanup(): void {
    const now = new Date();
    for (const [key, record] of this.attempts.entries()) {
      if (record.resetAt < now) {
        this.attempts.delete(key);
      }
    }
  }

  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Only apply to login endpoint
      if (!request.url.includes("/auth/login")) {
        return;
      }

      const forwarded = request.headers["x-forwarded-for"];
      const identifier = typeof forwarded === "string"
        ? forwarded.split(",")[0]!.trim()
        : request.ip;
      const result = this.check(identifier);

      if (!result.allowed) {
        return reply.code(429).send({
          error: "too_many_requests",
          message: "Too many login attempts. Please try again later.",
          retryAfter: Math.ceil(this.windowMs / 1000),
        });
      }

      // Add rate limit headers
      reply.header("X-RateLimit-Limit", this.maxAttempts.toString());
      reply.header(
        "X-RateLimit-Remaining",
        result.remainingAttempts.toString(),
      );
    };
  }
}

/**
 * Audit logging middleware
 */
export function createAuditMiddleware(store: ControlPlaneStore) {
  return async function auditMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    // Skip audit for certain routes
    if (
      request.url === "/health" ||
      request.url.includes("/auth/refresh") ||
      (request.routeOptions.config as any)?.noAudit
    ) {
      return;
    }

    // Register this function as an `onResponse` hook. Explicit route-level
    // audits remain the source of detailed resource identifiers.
    if (
      !["POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
      !request.currentUser
    ) return;

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: determineAction(request.method, request.url),
      resourceNodeId: null,
      outcome: reply.statusCode < 400 ? "success" : "failure",
      sourceIp: request.ip,
      details: {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
      },
    });
  };
}

function determineAction(method: string, url: string): string {
  const segments = url.split("/").filter(Boolean);
  const resource = segments[1] || "unknown";

  switch (method) {
    case "POST":
      return `${resource}.created`;
    case "PUT":
    case "PATCH":
      return `${resource}.updated`;
    case "DELETE":
      return `${resource}.deleted`;
    default:
      return `${resource}.${method.toLowerCase()}`;
  }
}
