/**
 * Audit Logger Middleware
 * 
 * Automatically logs all report access, exports, and sensitive operations.
 * Works in conjunction with the audit logging schema (migration 005).
 * 
 * Usage:
 *   router.get('/reports/financial', 
 *     authenticateToken, 
 *     requirePermission('reports:financial'),
 *     auditReportAccess('financial-tco', 'financial'), // Add audit logging
 *     handleGetFinancialReport
 *   );
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

// ============================================================================
// Configuration
// ============================================================================

interface AuditConfig {
  pool: Pool;
  enabled?: boolean;
  logToConsole?: boolean;
  captureRequestBody?: boolean;
  captureResponseBody?: boolean;
}

let config: AuditConfig;

/**
 * Initialize audit logger with database pool
 */
export function initializeAuditLogger(auditConfig: AuditConfig): void {
  config = {
    enabled: true,
    logToConsole: false,
    captureRequestBody: false,
    captureResponseBody: false,
    ...auditConfig
  };
  
  console.log('[AuditLogger] Initialized, enabled:', config.enabled);
}

// ============================================================================
// Core Audit Logging Function
// ============================================================================

/**
 * Log report access to database
 */
async function logAccess(data: {
  userId: string;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  reportType: string;
  reportCategory?: string;
  action: string;
  filters?: any;
  resultCount?: number;
  durationMs?: number;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
  status?: string;
  errorMessage?: string;
}): Promise<void> {
  if (!config || !config.enabled || !config.pool) {
    return;
  }

  try {
    await config.pool.query(
      `INSERT INTO report_access_log (
        user_id, user_email, user_name, user_role,
        report_type, report_category, action,
        filters, result_count, duration_ms,
        ip_address, user_agent, request_id, session_id,
        status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        data.userId,
        data.userEmail,
        data.userName,
        data.userRole,
        data.reportType,
        data.reportCategory || deriveCategory(data.reportType),
        data.action,
        data.filters ? JSON.stringify(data.filters) : null,
        data.resultCount,
        data.durationMs,
        data.ipAddress,
        data.userAgent,
        data.requestId,
        data.sessionId,
        data.status || 'success',
        data.errorMessage
      ]
    );

    if (config.logToConsole) {
      console.log('[Audit]', data.action, data.reportType, 'by', data.userEmail, '-', data.status);
    }
  } catch (error) {
    console.error('[AuditLogger] Error logging access:', error);
    // Don't throw - audit logging failure shouldn't break the request
  }
}

/**
 * Derive report category from report type
 */
function deriveCategory(reportType: string): string {
  if (reportType.includes('executive') || reportType.includes('kpi')) return 'executive';
  if (reportType.includes('financial') || reportType.includes('tco') || reportType.includes('roi')) return 'financial';
  if (reportType.includes('compliance') || reportType.includes('audit')) return 'compliance';
  if (reportType.includes('ai') || reportType.includes('analytics')) return 'ai-analytics';
  if (reportType.includes('branch') || reportType.includes('operational')) return 'operational';
  return 'other';
}

// ============================================================================
// Middleware Functions
// ============================================================================

/**
 * Main middleware: Audit report access
 * 
 * @param reportType - Type of report being accessed
 * @param reportCategory - Optional category override
 */
export function auditReportAccess(
  reportType: string,
  reportCategory?: string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to capture response
    res.json = function(data: any) {
      const durationMs = Date.now() - startTime;
      
      // Log access asynchronously (don't block response)
      setImmediate(() => {
        logAccess({
          userId: req.user?.id || 'anonymous',
          userEmail: req.user?.email,
          userName: req.user?.name,
          userRole: req.user?.role_name,
          reportType,
          reportCategory,
          action: 'view',
          filters: req.query,
          resultCount: Array.isArray(data?.data) ? data.data.length : undefined,
          durationMs,
          ipAddress: getClientIp(req),
          userAgent: req.get('user-agent'),
          requestId: req.get('x-request-id'),
          sessionId: req.get('x-sentinel-session'),
          status: 'success'
        });
      });
      
      return originalJson(data);
    };

    // Store original status method to capture errors
    const originalStatus = res.status.bind(res);
    res.status = function(code: number) {
      if (code >= 400) {
        const durationMs = Date.now() - startTime;
        
        setImmediate(() => {
          logAccess({
            userId: req.user?.id || 'anonymous',
            userEmail: req.user?.email,
            userName: req.user?.name,
            userRole: req.user?.role_name,
            reportType,
            reportCategory,
            action: 'view',
            filters: req.query,
            durationMs,
            ipAddress: getClientIp(req),
            userAgent: req.get('user-agent'),
            requestId: req.get('x-request-id'),
            sessionId: req.get('x-sentinel-session'),
            status: code === 403 ? 'denied' : code === 500 ? 'error' : 'failed',
            errorMessage: `HTTP ${code}`
          });
        });
      }
      
      return originalStatus(code);
    };

    next();
  };
}

/**
 * Audit export action (PDF/Excel)
 */
export function auditExportAction(
  reportType: string,
  exportFormat: 'pdf' | 'excel'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Store original send methods
    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);
    
    const logExport = () => {
      const durationMs = Date.now() - startTime;
      
      setImmediate(() => {
        logAccess({
          userId: req.user?.id || 'anonymous',
          userEmail: req.user?.email,
          userName: req.user?.name,
          userRole: req.user?.role_name,
          reportType,
          action: `export_${exportFormat}`,
          filters: req.query || req.body,
          durationMs,
          ipAddress: getClientIp(req),
          userAgent: req.get('user-agent'),
          requestId: req.get('x-request-id'),
          sessionId: req.get('x-sentinel-session'),
          status: 'success'
        });
      });
    };

    res.send = function(data: any) {
      logExport();
      return originalSend(data);
    };

    res.json = function(data: any) {
      logExport();
      return originalJson(data);
    };

    next();
  };
}

/**
 * Audit report scheduling
 */
export function auditScheduleAction(reportType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    
    res.json = function(data: any) {
      setImmediate(() => {
        logAccess({
          userId: req.user?.id || 'anonymous',
          userEmail: req.user?.email,
          userName: req.user?.name,
          userRole: req.user?.role_name,
          reportType,
          action: 'schedule',
          filters: req.body,
          ipAddress: getClientIp(req),
          userAgent: req.get('user-agent'),
          requestId: req.get('x-request-id'),
          sessionId: req.get('x-sentinel-session'),
          status: 'success'
        });
      });
      
      return originalJson(data);
    };

    next();
  };
}

/**
 * Audit report favorite action
 */
export function auditFavoriteAction(reportType: string, action: 'add' | 'remove') {
  return async (req: Request, res: Response, next: NextFunction) => {
    setImmediate(() => {
      logAccess({
        userId: req.user?.id || 'anonymous',
        userEmail: req.user?.email,
        userName: req.user?.name,
        userRole: req.user?.role_name,
        reportType,
        action: action === 'add' ? 'favorite_add' : 'favorite_remove',
        filters: req.body,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent'),
        requestId: req.get('x-request-id'),
        sessionId: req.get('x-sentinel-session'),
        status: 'success'
      });
    });

    next();
  };
}

/**
 * Generic audit middleware for any sensitive operation
 */
export function auditAction(
  action: string,
  category: string = 'system'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      const durationMs = Date.now() - startTime;
      
      setImmediate(() => {
        logAccess({
          userId: req.user?.id || 'anonymous',
          userEmail: req.user?.email,
          userName: req.user?.name,
          userRole: req.user?.role_name,
          reportType: category,
          action,
          filters: req.method === 'GET' ? req.query : req.body,
          durationMs,
          ipAddress: getClientIp(req),
          userAgent: req.get('user-agent'),
          requestId: req.get('x-request-id'),
          sessionId: req.get('x-sentinel-session'),
          status: 'success'
        });
      });
      
      return originalJson(data);
    };

    next();
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get client IP address (handle proxies)
 */
function getClientIp(req: Request): string {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIp = req.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Manually log an audit event (for use in route handlers)
 */
export async function logAuditEvent(data: {
  userId: string;
  userEmail?: string;
  reportType: string;
  action: string;
  filters?: any;
  status?: string;
  errorMessage?: string;
  request?: Request;
}): Promise<void> {
  await logAccess({
    userId: data.userId,
    userEmail: data.userEmail,
    reportType: data.reportType,
    action: data.action,
    filters: data.filters,
    ipAddress: data.request ? getClientIp(data.request) : undefined,
    userAgent: data.request?.get('user-agent'),
    status: data.status,
    errorMessage: data.errorMessage
  });
}

// ============================================================================
// Audit Query Functions (for Admin Dashboard)
// ============================================================================

/**
 * Get audit summary by user
 */
export async function getAuditSummaryByUser(
  days: number = 30
): Promise<Array<{
  userId: string;
  userEmail: string;
  userRole: string;
  totalAccesses: number;
  views: number;
  exports: number;
  deniedAttempts: number;
}>> {
  if (!config || !config.pool) return [];

  try {
    const result = await config.pool.query(
      'SELECT * FROM v_report_access_by_user',
      []
    );
    
    return result.rows;
  } catch (error) {
    console.error('[AuditLogger] Error getting user summary:', error);
    return [];
  }
}

/**
 * Get audit summary by report type
 */
export async function getAuditSummaryByReport(
  days: number = 30
): Promise<Array<{
  reportType: string;
  reportCategory: string;
  totalAccesses: number;
  uniqueUsers: number;
  views: number;
  exports: number;
}>> {
  if (!config || !config.pool) return [];

  try {
    const result = await config.pool.query(
      'SELECT * FROM v_report_access_by_type',
      []
    );
    
    return result.rows;
  } catch (error) {
    console.error('[AuditLogger] Error getting report summary:', error);
    return [];
  }
}

/**
 * Get suspicious access patterns
 */
export async function getSuspiciousAccessPatterns(): Promise<Array<{
  userId: string;
  userEmail: string;
  userRole: string;
  deniedAttempts: number;
  uniqueReportsAttempted: number;
  attemptedReports: string[];
}>> {
  if (!config || !config.pool) return [];

  try {
    const result = await config.pool.query(
      'SELECT * FROM v_suspicious_access_patterns',
      []
    );
    
    return result.rows;
  } catch (error) {
    console.error('[AuditLogger] Error getting suspicious patterns:', error);
    return [];
  }
}

/**
 * Get user's access history
 */
export async function getUserAccessHistory(
  userId: string,
  days: number = 30
): Promise<Array<{
  accessedAt: Date;
  reportType: string;
  action: string;
  status: string;
  durationMs: number;
}>> {
  if (!config || !config.pool) return [];

  try {
    const result = await config.pool.query(
      'SELECT * FROM get_user_access_history($1, $2)',
      [userId, days]
    );
    
    return result.rows;
  } catch (error) {
    console.error('[AuditLogger] Error getting user history:', error);
    return [];
  }
}

/**
 * Generate compliance report
 */
export async function generateComplianceReport(
  startDate: Date,
  endDate: Date
): Promise<Array<{
  date: Date;
  totalAccesses: number;
  uniqueUsers: number;
  financialAccesses: number;
  complianceAccesses: number;
  deniedAttempts: number;
  avgResponseTimeMs: number;
}>> {
  if (!config || !config.pool) return [];

  try {
    const result = await config.pool.query(
      'SELECT * FROM generate_compliance_audit_report($1, $2)',
      [startDate, endDate]
    );
    
    return result.rows;
  } catch (error) {
    console.error('[AuditLogger] Error generating compliance report:', error);
    return [];
  }
}

/**
 * Check for unusual access pattern
 */
export async function detectUnusualAccess(
  userId: string,
  threshold: number = 10
): Promise<boolean> {
  if (!config || !config.pool) return false;

  try {
    const result = await config.pool.query(
      'SELECT detect_unusual_access($1, $2) as unusual',
      [userId, threshold]
    );
    
    return result.rows[0]?.unusual || false;
  } catch (error) {
    console.error('[AuditLogger] Error detecting unusual access:', error);
    return false;
  }
}

// ============================================================================
// Daily Statistics Calculation (Scheduled Job)
// ============================================================================

/**
 * Calculate daily statistics (run via cron)
 */
export async function calculateDailyStatistics(date?: Date): Promise<void> {
  if (!config || !config.pool) {
    console.error('[AuditLogger] Not initialized');
    return;
  }

  try {
    const targetDate = date || new Date();
    await config.pool.query(
      'SELECT calculate_daily_audit_statistics($1)',
      [targetDate]
    );
    
    console.log(`[AuditLogger] Calculated daily statistics for ${targetDate.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('[AuditLogger] Error calculating daily statistics:', error);
  }
}

// ============================================================================
// Export Everything
// ============================================================================

export default {
  initializeAuditLogger,
  auditReportAccess,
  auditExportAction,
  auditScheduleAction,
  auditFavoriteAction,
  auditAction,
  logAuditEvent,
  getAuditSummaryByUser,
  getAuditSummaryByReport,
  getSuspiciousAccessPatterns,
  getUserAccessHistory,
  generateComplianceReport,
  detectUnusualAccess,
  calculateDailyStatistics
};
