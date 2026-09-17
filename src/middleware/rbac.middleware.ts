/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Provides permission-based access control for API routes.
 * Works in conjunction with the RBAC database schema (migration 004).
 * 
 * Usage:
 *   router.get('/reports/financial', 
 *     authenticateToken, 
 *     requirePermission('reports:financial'),
 *     handleGetFinancialReport
 *   );
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        tenantId: string;
        role_id?: string;
        role_name?: string;
        permissions?: string[];
      };
    }
  }
}

// ============================================================================
// RBAC Configuration
// ============================================================================

interface RBACConfig {
  pool: Pool;
  cacheEnabled?: boolean;
  cacheTTL?: number; // seconds
  logUnauthorized?: boolean;
}

let config: RBACConfig;

// Permission cache (in-memory for performance)
const permissionCache = new Map<string, {
  permissions: string[];
  expiresAt: number;
}>();

/**
 * Initialize RBAC middleware with database pool
 */
export function initializeRBAC(rbacConfig: RBACConfig): void {
  config = {
    cacheEnabled: true,
    cacheTTL: 300, // 5 minutes default
    logUnauthorized: true,
    ...rbacConfig
  };
  
  console.log('[RBAC] Initialized with cache:', config.cacheEnabled);
}

// ============================================================================
// Core Permission Check Functions
// ============================================================================

/**
 * Check if user has a specific permission
 */
async function hasPermission(
  userId: string, 
  permission: string,
  scope: string = 'all'
): Promise<boolean> {
  if (!config || !config.pool) {
    console.error('[RBAC] Not initialized - call initializeRBAC() first');
    return false;
  }

  try {
    // Check cache first
    if (config.cacheEnabled) {
      const cached = permissionCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) {
        return checkPermissionInList(cached.permissions, permission, scope);
      }
    }

    // Query database using the permission check function
    const parts = permission.split(':');
    const resource = parts[0];
    const action = parts[1] || '*';
    
    const result = await config.pool.query(
      'SELECT user_has_permission($1, $2, $3, $4) as has_permission',
      [userId, resource, action, scope]
    );

    return result.rows[0]?.has_permission || false;
  } catch (error) {
    console.error('[RBAC] Permission check error:', error);
    return false;
  }
}

/**
 * Load all permissions for a user into cache
 */
async function loadUserPermissions(userId: string): Promise<string[]> {
  if (!config || !config.pool) return [];

  try {
    const result = await config.pool.query(
      'SELECT * FROM get_user_permissions($1)',
      [userId]
    );

    const permissions = result.rows.map(row => {
      const parts = [row.resource];
      if (row.action && row.action !== '*') parts.push(row.action);
      if (row.scope && row.scope !== 'all') parts.push(row.scope);
      return parts.join(':');
    });

    // Cache permissions
    if (config.cacheEnabled) {
      permissionCache.set(userId, {
        permissions,
        expiresAt: Date.now() + (config.cacheTTL! * 1000)
      });
    }

    return permissions;
  } catch (error) {
    console.error('[RBAC] Error loading user permissions:', error);
    return [];
  }
}

/**
 * Check if a permission exists in a permission list
 */
function checkPermissionInList(
  permissions: string[],
  required: string,
  scope: string = 'all'
): boolean {
  // Check for wildcard (super admin)
  if (permissions.includes('*') || permissions.includes('*:*')) {
    return true;
  }

  const parts = required.split(':');
  const resource = parts[0];
  const action = parts[1] || '*';

  // Check exact match
  const exactMatch = `${resource}:${action}:${scope}`;
  if (permissions.includes(exactMatch)) return true;

  // Check without scope
  const withoutScope = `${resource}:${action}`;
  if (permissions.includes(withoutScope)) return true;

  // Check resource wildcard (e.g., "reports:*")
  const resourceWildcard = `${resource}:*`;
  if (permissions.includes(resourceWildcard)) return true;

  // Check action wildcard with scope
  const actionWildcard = `${resource}:*:${scope}`;
  if (permissions.includes(actionWildcard)) return true;

  return false;
}

// ============================================================================
// Middleware Functions
// ============================================================================

/**
 * Main middleware: Require specific permission
 * 
 * @param permission - Permission string in format "resource:action:scope"
 *                     Examples: "reports:financial", "reports:view:own", "incidents:*"
 * @param options - Additional options
 */
export function requirePermission(
  permission: string,
  options: {
    scope?: string;
    errorMessage?: string;
    logDenial?: boolean;
  } = {}
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      const { scope = 'all', errorMessage, logDenial = config.logUnauthorized } = options;

      // Check permission
      const allowed = await hasPermission(req.user.id, permission, scope);

      if (!allowed) {
        // Log unauthorized access attempt
        if (logDenial) {
          await logUnauthorizedAccess(req, permission);
        }

        return res.status(403).json({
          error: 'Forbidden',
          message: errorMessage || 'Insufficient permissions',
          required_permission: permission,
          user_role: req.user.role_name || 'unknown'
        });
      }

      // Permission granted - continue
      next();
    } catch (error) {
      console.error('[RBAC] requirePermission middleware error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Permission check failed'
      });
    }
  };
}

/**
 * Require ANY of the listed permissions (OR logic)
 */
export function requireAnyPermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Check each permission
      for (const permission of permissions) {
        const allowed = await hasPermission(req.user.id, permission);
        if (allowed) {
          return next(); // At least one permission granted
        }
      }

      // None of the permissions granted
      await logUnauthorizedAccess(req, permissions.join(' OR '));
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required_permissions: permissions,
        user_role: req.user.role_name
      });
    } catch (error) {
      console.error('[RBAC] requireAnyPermission error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Require ALL of the listed permissions (AND logic)
 */
export function requireAllPermissions(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Check each permission
      for (const permission of permissions) {
        const allowed = await hasPermission(req.user.id, permission);
        if (!allowed) {
          await logUnauthorizedAccess(req, permission);
          
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Insufficient permissions',
            missing_permission: permission,
            required_permissions: permissions,
            user_role: req.user.role_name
          });
        }
      }

      // All permissions granted
      next();
    } catch (error) {
      console.error('[RBAC] requireAllPermissions error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Check if user has role
 */
export function requireRole(...roleNames: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userRole = req.user.role_name;
    
    if (!userRole || !roleNames.includes(userRole)) {
      await logUnauthorizedAccess(req, `role:${roleNames.join('|')}`);
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient role',
        required_roles: roleNames,
        user_role: userRole || 'none'
      });
    }

    next();
  };
}

/**
 * Middleware to load user permissions into request object
 * Useful for conditional rendering or complex permission checks
 */
export function loadPermissions() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.user && req.user.id) {
      try {
        req.user.permissions = await loadUserPermissions(req.user.id);
      } catch (error) {
        console.error('[RBAC] Error loading permissions:', error);
        req.user.permissions = [];
      }
    }
    next();
  };
}

/**
 * Middleware to check resource ownership (for scope="own")
 * 
 * Usage:
 *   router.get('/reports/branch/:branchId',
 *     authenticateToken,
 *     requirePermission('reports:branch-benchmarking', { scope: 'own' }),
 *     checkResourceOwnership('branchId'),
 *     handleGetBranchReport
 *   );
 */
export function checkResourceOwnership(resourceIdParam: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const resourceId = req.params[resourceIdParam];
      
      if (!resourceId) {
        return res.status(400).json({ error: 'Resource ID required' });
      }

      // Query user's branch_id
      const result = await config.pool.query(
        'SELECT branch_id FROM users WHERE id = $1',
        [req.user.id]
      );

      const userBranchId = result.rows[0]?.branch_id;

      // Check if user owns this resource
      if (resourceId !== userBranchId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only access your own branch data'
        });
      }

      next();
    } catch (error) {
      console.error('[RBAC] Ownership check error:', error);
      return res.status(500).json({ error: 'Ownership check failed' });
    }
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Log unauthorized access attempt
 */
async function logUnauthorizedAccess(
  req: Request,
  permission: string
): Promise<void> {
  if (!config || !config.pool) return;

  try {
    await config.pool.query(
      `INSERT INTO audit_log (user_id, action, resource, details, ip_address, user_agent, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        req.user?.id,
        'access_denied',
        permission,
        JSON.stringify({
          path: req.path,
          method: req.method,
          query: req.query,
          user_role: req.user?.role_name
        }),
        req.ip,
        req.get('user-agent'),
        'denied'
      ]
    );
  } catch (error) {
    console.error('[RBAC] Error logging unauthorized access:', error);
  }
}

/**
 * Clear permission cache for a user
 */
export function clearUserPermissionCache(userId: string): void {
  permissionCache.delete(userId);
  console.log(`[RBAC] Cleared permission cache for user ${userId}`);
}

/**
 * Clear all permission caches
 */
export function clearAllPermissionCaches(): void {
  permissionCache.clear();
  console.log('[RBAC] Cleared all permission caches');
}

/**
 * Get user's full permission list (for debugging)
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  return loadUserPermissions(userId);
}

/**
 * Manually check permission (for use in route handlers)
 */
export async function checkPermission(
  userId: string,
  permission: string,
  scope: string = 'all'
): Promise<boolean> {
  return hasPermission(userId, permission, scope);
}

// ============================================================================
// Role Management Functions (Admin Routes)
// ============================================================================

/**
 * Assign role to user
 */
export async function assignRole(
  userId: string,
  roleName: string,
  assignedBy?: string
): Promise<boolean> {
  if (!config || !config.pool) {
    throw new Error('RBAC not initialized');
  }

  try {
    const result = await config.pool.query(
      `UPDATE users 
       SET role_id = (SELECT id FROM user_roles WHERE name = $2 AND active = true)
       WHERE id = $1
       RETURNING role_id`,
      [userId, roleName]
    );

    if (result.rows.length > 0) {
      // Clear cache
      clearUserPermissionCache(userId);
      
      // Log role change if assignedBy provided
      if (assignedBy) {
        await config.pool.query(
          `UPDATE role_change_log 
           SET changed_by = $1 
           WHERE user_id = $2 
           ORDER BY changed_at DESC 
           LIMIT 1`,
          [assignedBy, userId]
        );
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[RBAC] Error assigning role:', error);
    throw error;
  }
}

/**
 * Get user's current role
 */
export async function getUserRole(userId: string): Promise<{
  id: string;
  name: string;
  display_name: string;
  permissions: string[];
} | null> {
  if (!config || !config.pool) return null;

  try {
    const result = await config.pool.query(
      `SELECT ur.id, ur.name, ur.display_name, ur.permissions
       FROM users u
       JOIN user_roles ur ON ur.id = u.role_id
       WHERE u.id = $1 AND u.active = true AND ur.active = true`,
      [userId]
    );

    if (result.rows.length > 0) {
      return {
        id: result.rows[0].id,
        name: result.rows[0].name,
        display_name: result.rows[0].display_name,
        permissions: result.rows[0].permissions
      };
    }

    return null;
  } catch (error) {
    console.error('[RBAC] Error getting user role:', error);
    return null;
  }
}

/**
 * List all available roles
 */
export async function listRoles(): Promise<Array<{
  id: string;
  name: string;
  display_name: string;
  description: string;
  is_system_role: boolean;
}>> {
  if (!config || !config.pool) return [];

  try {
    const result = await config.pool.query(
      `SELECT id, name, display_name, description, is_system_role
       FROM user_roles
       WHERE active = true
       ORDER BY 
         CASE name
           WHEN 'super_admin' THEN 1
           WHEN 'ceo' THEN 2
           WHEN 'cfo' THEN 3
           WHEN 'coo' THEN 4
           ELSE 10
         END,
         name`
    );

    return result.rows;
  } catch (error) {
    console.error('[RBAC] Error listing roles:', error);
    return [];
  }
}

// ============================================================================
// Express Integration Helper
// ============================================================================

/**
 * Helper to protect multiple routes with same permission
 */
export function protectRoutes(router: any, permission: string, routes: Array<{
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  handler: any;
}>) {
  routes.forEach(route => {
    router[route.method](
      route.path,
      requirePermission(permission),
      route.handler
    );
  });
}

// ============================================================================
// Export Everything
// ============================================================================

export default {
  initializeRBAC,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireRole,
  loadPermissions,
  checkResourceOwnership,
  clearUserPermissionCache,
  clearAllPermissionCaches,
  getUserPermissions,
  checkPermission,
  assignRole,
  getUserRole,
  listRoles,
  protectRoutes
};
