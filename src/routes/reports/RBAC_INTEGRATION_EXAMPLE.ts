/**
 * RBAC Integration Example
 * 
 * This file demonstrates how to integrate RBAC middleware with existing report routes.
 * Copy these patterns to your actual route files.
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requirePermission, requireAnyPermission, requireRole, checkResourceOwnership } from '../../middleware/rbac.middleware.js';

// ============================================================================
// EXAMPLE 1: Simple Permission Check
// ============================================================================

export function createProtectedReportRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * Executive KPI Dashboard - Requires executive-level access
   * 
   * Allowed roles: super_admin, ceo, cfo, coo, security_manager, viewer
   */
  router.get(
    '/executive-kpi',
    authenticateToken,
    requirePermission('reports:executive-kpi'), // RBAC check
    async (req, res) => {
      // Your existing handler code
      // No changes needed to handler logic
    }
  );

  /**
   * Financial TCO Report - Restricted to finance team
   * 
   * Allowed roles: super_admin, ceo, cfo, finance_analyst
   */
  router.get(
    '/financial/tco',
    authenticateToken,
    requirePermission('reports:financial'), // RBAC check
    async (req, res) => {
      // Your existing handler code
    }
  );

  /**
   * Financial ROI Report - Restricted to finance team
   */
  router.get(
    '/financial/roi',
    authenticateToken,
    requirePermission('reports:financial'), // RBAC check
    async (req, res) => {
      // Your existing handler code
    }
  );

  /**
   * Branch Benchmarking - Accessible to most roles
   * 
   * Allowed roles: super_admin, ceo, cfo, coo, security_manager, branch_manager, analysts
   */
  router.get(
    '/branch-benchmarking',
    authenticateToken,
    requirePermission('reports:branch-benchmarking'), // RBAC check
    async (req, res) => {
      // Your existing handler code
    }
  );

  /**
   * Compliance Scorecard - Compliance and executives
   * 
   * Allowed roles: super_admin, ceo, coo, compliance_officer
   */
  router.get(
    '/compliance-scorecard',
    authenticateToken,
    requirePermission('reports:compliance'), // RBAC check
    async (req, res) => {
      // Your existing handler code
    }
  );

  /**
   * MIS Unified Report - Operations and executives
   */
  router.get(
    '/mis',
    authenticateToken,
    requirePermission('reports:mis'), // RBAC check
    async (req, res) => {
      // Your existing handler code
    }
  );

  /**
   * AI Analytics Dashboard - Security and executives
   * 
   * Allowed roles: super_admin, ceo, coo, security_manager
   */
  router.get(
    '/ai-analytics',
    authenticateToken,
    requirePermission('reports:ai-analytics'), // RBAC check
    async (req, res) => {
      // Your existing handler code
    }
  );

  return router;
}

// ============================================================================
// EXAMPLE 2: Multiple Permissions (OR logic)
// ============================================================================

export function createFlexibleAccessRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * Reports that can be accessed by EITHER finance OR operations
   */
  router.get(
    '/cost-analysis',
    authenticateToken,
    requireAnyPermission(
      'reports:financial',
      'reports:branch-benchmarking'
    ),
    async (req, res) => {
      // Accessible if user has EITHER permission
    }
  );

  return router;
}

// ============================================================================
// EXAMPLE 3: Role-Based Access
// ============================================================================

export function createRoleBasedRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * Admin-only route
   */
  router.get(
    '/admin/users',
    authenticateToken,
    requireRole('super_admin'),
    async (req, res) => {
      // Only super_admin can access
    }
  );

  /**
   * Executive-only route
   */
  router.get(
    '/executive/board-report',
    authenticateToken,
    requireRole('super_admin', 'ceo'),
    async (req, res) => {
      // Only super_admin and CEO can access
    }
  );

  return router;
}

// ============================================================================
// EXAMPLE 4: Resource Ownership (Branch Managers)
// ============================================================================

export function createOwnershipRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * Branch-specific report - only accessible to the branch manager of that branch
   * 
   * Branch managers can ONLY see their own branch data
   */
  router.get(
    '/branch/:branchId/detail',
    authenticateToken,
    requirePermission('reports:branch-benchmarking', { scope: 'own' }),
    checkResourceOwnership('branchId'), // Verify user owns this branch
    async (req, res) => {
      const { branchId } = req.params;
      
      // User has been verified to own this branch
      // Safe to show branch-specific data
    }
  );

  /**
   * Branch manager's own incidents
   */
  router.get(
    '/incidents/my-branch',
    authenticateToken,
    requirePermission('incidents', { scope: 'own' }),
    async (req, res) => {
      // Get user's branch_id from req.user
      const userBranchId = req.user?.branch_id;
      
      // Query incidents for user's branch only
      const incidents = await pool.query(
        'SELECT * FROM incidents WHERE branch_id = $1',
        [userBranchId]
      );
      
      res.json({ incidents: incidents.rows });
    }
  );

  return router;
}

// ============================================================================
// EXAMPLE 5: Export Actions with Separate Permissions
// ============================================================================

export function createExportRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * View report (read-only)
   */
  router.get(
    '/reports/financial',
    authenticateToken,
    requirePermission('reports:financial:view'),
    async (req, res) => {
      // User can VIEW the report
    }
  );

  /**
   * Export report (requires export permission)
   */
  router.post(
    '/reports/financial/export',
    authenticateToken,
    requirePermission('reports:financial:export'),
    async (req, res) => {
      // User can EXPORT the report
      // Generate PDF/Excel and send
    }
  );

  return router;
}

// ============================================================================
// EXAMPLE 6: Conditional Logic in Handler
// ============================================================================

export function createConditionalRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * Report with conditional data masking based on role
   */
  router.get(
    '/reports/financial/summary',
    authenticateToken,
    requireAnyPermission('reports:financial', 'reports:financial:view'),
    async (req, res) => {
      const userId = req.user!.id;
      
      // Load user permissions
      const permissions = await pool.query(
        'SELECT * FROM get_user_permissions($1)',
        [userId]
      );
      
      // Check if user has full financial access
      const hasFullAccess = permissions.rows.some(
        p => p.resource === 'reports' && p.action === 'financial' && p.scope === 'all'
      );
      
      // Get financial data
      const data = await getFinancialData();
      
      // Mask sensitive data if user doesn't have full access
      if (!hasFullAccess) {
        data.actualCosts = '***';
        data.vendorPricing = '***';
        data.salaryData = '***';
      }
      
      res.json(data);
    }
  );

  return router;
}

// ============================================================================
// EXAMPLE 7: Custom Error Messages
// ============================================================================

export function createCustomErrorRoutes(pool: Pool): Router {
  const router = Router();

  router.get(
    '/reports/sensitive',
    authenticateToken,
    requirePermission('reports:sensitive', {
      errorMessage: 'Access to sensitive reports requires CFO approval. Please contact finance@company.com.'
    }),
    async (req, res) => {
      // Handler
    }
  );

  return router;
}

// ============================================================================
// EXAMPLE 8: Admin Routes (Role Management)
// ============================================================================

export function createAdminRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * List all roles (admin only)
   */
  router.get(
    '/admin/roles',
    authenticateToken,
    requireRole('super_admin'),
    async (req, res) => {
      const roles = await pool.query(
        'SELECT id, name, display_name, description FROM user_roles WHERE active = true'
      );
      res.json({ roles: roles.rows });
    }
  );

  /**
   * Assign role to user (admin only)
   */
  router.post(
    '/admin/users/:userId/role',
    authenticateToken,
    requireRole('super_admin'),
    async (req, res) => {
      const { userId } = req.params;
      const { roleId } = req.body;
      
      await pool.query(
        'UPDATE users SET role_id = $1 WHERE id = $2',
        [roleId, userId]
      );
      
      res.json({ success: true });
    }
  );

  /**
   * View role change audit log (admin only)
   */
  router.get(
    '/admin/audit/role-changes',
    authenticateToken,
    requireRole('super_admin'),
    async (req, res) => {
      const changes = await pool.query(
        `SELECT rcl.*, u.email as user_email, ur_old.name as old_role, ur_new.name as new_role
         FROM role_change_log rcl
         JOIN users u ON u.id = rcl.user_id
         LEFT JOIN user_roles ur_old ON ur_old.id = rcl.old_role_id
         LEFT JOIN user_roles ur_new ON ur_new.id = rcl.new_role_id
         ORDER BY rcl.changed_at DESC
         LIMIT 100`
      );
      
      res.json({ changes: changes.rows });
    }
  );

  return router;
}

// ============================================================================
// EXAMPLE 9: Update Existing app.ts Integration
// ============================================================================

/**
 * Example: How to integrate RBAC into existing app.ts
 */
export function exampleAppIntegration() {
  /*
  
  // In src/app.ts:
  
  import { initializeRBAC } from './middleware/rbac.middleware.js';
  import { createProtectedReportRoutes } from './routes/reports/protected.routes.js';
  
  // Initialize RBAC (after database pool is created)
  initializeRBAC({ 
    pool: dbPool,
    cacheEnabled: true,
    cacheTTL: 300,
    logUnauthorized: true
  });
  
  // Register protected routes
  app.use('/api/control/v1/reports', createProtectedReportRoutes(dbPool));
  
  */
}

// ============================================================================
// EXAMPLE 10: Testing RBAC Locally
// ============================================================================

export async function testRBACIntegration(pool: Pool) {
  /*
  
  // Test script to verify RBAC is working
  
  import { checkPermission, getUserRole } from './middleware/rbac.middleware.js';
  
  // Test 1: Check if CEO has financial access
  const hasFinancialAccess = await checkPermission(
    'user-id-here',
    'reports:financial'
  );
  console.log('CEO has financial access:', hasFinancialAccess);
  
  // Test 2: Get user's role
  const role = await getUserRole('user-id-here');
  console.log('User role:', role);
  
  // Test 3: Verify permissions are cached
  const start = Date.now();
  await checkPermission('user-id-here', 'reports:financial');
  const duration = Date.now() - start;
  console.log('Permission check took:', duration, 'ms (should be fast if cached)');
  
  */
}

// ============================================================================
// MIGRATION CHECKLIST
// ============================================================================

/**
 * Step-by-step guide to add RBAC to existing routes:
 * 
 * 1. Run database migration:
 *    psql -U postgres -d surveillance -f migrations/004_rbac_schema.sql
 * 
 * 2. Initialize RBAC in app.ts:
 *    import { initializeRBAC } from './middleware/rbac.middleware.js';
 *    initializeRBAC({ pool: dbPool });
 * 
 * 3. Update route files (one at a time):
 *    - Import requirePermission from rbac.middleware.ts
 *    - Add requirePermission() after authenticateToken
 *    - Test the route
 * 
 * 4. Assign roles to users:
 *    UPDATE users SET role_id = (SELECT id FROM user_roles WHERE name = 'cfo') WHERE email = 'cfo@company.com';
 * 
 * 5. Test with different roles:
 *    - Login as CEO → should access all reports
 *    - Login as CFO → should access financial reports
 *    - Login as branch manager → should only see own branch
 * 
 * 6. Update frontend (see RBAC_INTEGRATION_EXAMPLE_FRONTEND.tsx):
 *    - Hide navigation links based on permissions
 *    - Show role-appropriate dashboards
 * 
 * 7. Monitor audit logs:
 *    SELECT * FROM audit_log WHERE action = 'access_denied' ORDER BY created_at DESC;
 */
