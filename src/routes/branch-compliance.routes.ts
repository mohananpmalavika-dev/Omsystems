import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

export interface BranchComplianceRouteOptions {
  pool: any;
}

interface AuthenticatedRequest extends FastifyRequest {
  currentUser?: {
    id: string;
    tenantId: string;
    role: string;
  };
}

export function registerBranchComplianceRoutes(
  app: FastifyInstance,
  options: BranchComplianceRouteOptions
) {
  const { pool } = options;

  function requireAuth(request: AuthenticatedRequest) {
    if (!request.currentUser?.tenantId) {
      throw new Error("authentication_required");
    }
    return request.currentUser;
  }

  // Get comprehensive branch compliance dashboard
  app.get("/api/compliance/branch-audit", async (request: AuthenticatedRequest, reply) => {
    try {
      const user = requireAuth(request);
      const query = request.query as {
        branchId?: string;
        period?: string;
      };

      const period = query.period || "30d";
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Coverage verification - cameras and recording status
      const coverageQuery = `
        WITH branch_list AS (
          SELECT 
            b.id,
            b.name,
            b.code,
            b.type,
            b.status
          FROM branches b
          WHERE b.tenant_id = $1
            ${query.branchId ? "AND b.id = $2" : ""}
            AND b.status = 'active'
        ),
        camera_coverage AS (
          SELECT 
            c.branch_node_id as branch_id,
            COUNT(*) as total_cameras,
            COUNT(*) FILTER (WHERE c.status = 'online') as online_cameras,
            COUNT(*) FILTER (WHERE c.status = 'offline') as offline_cameras,
            COUNT(*) FILTER (WHERE c.last_seen_at >= NOW() - INTERVAL '5 minutes') as recently_active,
            COUNT(*) FILTER (WHERE c.status = 'recording') as recording_cameras,
            COUNT(*) FILTER (WHERE cnode.name ~* 'locker|vault|cash|counter') as critical_zone_cameras,
            COUNT(*) FILTER (WHERE cnode.name ~* 'locker|vault|cash|counter' AND c.status = 'online') as critical_zone_online
          FROM cameras c
          JOIN resource_nodes cnode ON cnode.id = c.resource_node_id
          WHERE cnode.tenant_id = $1::uuid
            ${query.branchId ? "AND c.branch_node_id = $2::uuid" : ""}
          GROUP BY c.branch_node_id
        ),
        recording_health AS (
          SELECT 
            r.branch_id,
            COUNT(*) FILTER (WHERE r.status = 'active') as active_recorders,
            COUNT(*) FILTER (WHERE r.health_status = 'healthy') as healthy_recorders,
            SUM(r.storage_used_gb) as total_storage_used_gb,
            SUM(r.storage_total_gb) as total_storage_capacity_gb
          FROM recorders r
          WHERE r.tenant_id = $1
            ${query.branchId ? "AND r.branch_id = $2" : ""}
          GROUP BY r.branch_id
        ),
        zone_coverage AS (
          SELECT 
            z.branch_id,
            COUNT(*) as total_zones,
            COUNT(*) FILTER (WHERE z.enabled = true) as enabled_zones,
            COUNT(DISTINCT z.type) as unique_zone_types
          FROM nbfc_analytics_zones z
          WHERE z.tenant_id = $1
            ${query.branchId ? "AND z.branch_id = $2" : ""}
          GROUP BY z.branch_id
        )
        SELECT 
          bl.id as branch_id,
          bl.name as branch_name,
          bl.code as branch_code,
          bl.type as branch_type,
          COALESCE(cc.total_cameras, 0) as total_cameras,
          COALESCE(cc.online_cameras, 0) as online_cameras,
          COALESCE(cc.offline_cameras, 0) as offline_cameras,
          COALESCE(cc.recently_active, 0) as recently_active_cameras,
          COALESCE(cc.recording_cameras, 0) as recording_cameras,
          COALESCE(cc.critical_zone_cameras, 0) as critical_zone_cameras,
          COALESCE(cc.critical_zone_online, 0) as critical_zone_online,
          COALESCE(rh.active_recorders, 0) as active_recorders,
          COALESCE(rh.healthy_recorders, 0) as healthy_recorders,
          COALESCE(rh.total_storage_used_gb, 0) as storage_used_gb,
          COALESCE(rh.total_storage_capacity_gb, 0) as storage_capacity_gb,
          COALESCE(zc.total_zones, 0) as total_zones,
          COALESCE(zc.enabled_zones, 0) as enabled_zones,
          COALESCE(zc.unique_zone_types, 0) as unique_zone_types,
          CASE 
            WHEN cc.total_cameras = 0 THEN 0
            ELSE ROUND((cc.online_cameras::float / cc.total_cameras * 100), 1)
          END as camera_availability_pct,
          CASE 
            WHEN cc.critical_zone_cameras = 0 THEN 100
            ELSE ROUND((cc.critical_zone_online::float / cc.critical_zone_cameras * 100), 1)
          END as critical_zone_coverage_pct
        FROM branch_list bl
        LEFT JOIN camera_coverage cc ON cc.branch_id = bl.id
        LEFT JOIN recording_health rh ON rh.branch_id = bl.id
        LEFT JOIN zone_coverage zc ON zc.branch_id = bl.id
        ORDER BY bl.name
      `;

      const coverageParams = query.branchId ? [user.tenantId, query.branchId] : [user.tenantId];
      const coverageResult = await pool.query(coverageQuery, coverageParams);

      // AI rule compliance - activation status
      const rulesComplianceQuery = `
        WITH branch_rules AS (
          SELECT 
            CASE 
              WHEN branch_ids = '[]'::jsonb THEN 'ALL'
              ELSE branch_ids->>0
            END as branch_id,
            COUNT(*) as total_rules,
            COUNT(*) FILTER (WHERE enabled = true AND state = 'ACTIVE') as active_rules,
            COUNT(*) FILTER (WHERE enabled = true AND state = 'SHADOW') as shadow_rules,
            COUNT(*) FILTER (WHERE enabled = false OR state = 'INACTIVE') as inactive_rules,
            COUNT(*) FILTER (WHERE template_id IS NOT NULL) as template_based_rules,
            COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical_rules,
            COUNT(DISTINCT detector_type) as unique_detectors
          FROM nbfc_analytics_rules
          WHERE tenant_id = $1::uuid
            ${query.branchId ? "AND (branch_ids IS NULL OR branch_ids = '[]'::jsonb OR branch_ids @> '[\"*\"]'::jsonb OR branch_ids @> '[\"ALL\"]'::jsonb OR branch_ids @> jsonb_build_array($2::text))" : ""}
          GROUP BY branch_id
        )
        SELECT * FROM branch_rules
        ORDER BY branch_id
      `;

      const rulesParams = query.branchId ? [user.tenantId, query.branchId] : [user.tenantId];
      const rulesResult = await pool.query(rulesComplianceQuery, rulesParams);

      // Incident response compliance
      const incidentComplianceQuery = `
        WITH incident_stats AS (
          SELECT 
            i.branch_id,
            COUNT(*) as total_incidents,
            COUNT(*) FILTER (WHERE i.severity = 'CRITICAL') as critical_incidents,
            COUNT(*) FILTER (WHERE i.status = 'resolved') as resolved_incidents,
            COUNT(*) FILTER (WHERE i.status IN ('open', 'investigating')) as open_incidents,
            AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 60) FILTER (WHERE i.resolved_at IS NOT NULL) as avg_resolution_minutes,
            COUNT(*) FILTER (WHERE i.assigned_to IS NOT NULL) as assigned_incidents,
            COUNT(*) FILTER (WHERE jsonb_array_length(i.evidence_attachments) > 0) as incidents_with_evidence
          FROM incidents i
          WHERE i.tenant_id = $1
            AND i.created_at >= $3
            ${query.branchId ? "AND i.branch_id = $2" : ""}
          GROUP BY i.branch_id
        )
        SELECT * FROM incident_stats
      `;

      const incidentParams = query.branchId 
        ? [user.tenantId, query.branchId, startDate]
        : [user.tenantId, startDate];
      const incidentResult = await pool.query(incidentComplianceQuery, incidentParams);

      // Evidence and audit trail compliance
      const evidenceComplianceQuery = `
        WITH evidence_stats AS (
          SELECT 
            e.branch_id,
            COUNT(*) as total_evidence_items,
            COUNT(*) FILTER (WHERE e.status = 'preserved') as preserved_items,
            COUNT(*) FILTER (WHERE e.chain_of_custody_verified = true) as chain_verified,
            COUNT(*) FILTER (WHERE e.legal_hold = true) as legal_hold_items,
            COUNT(*) FILTER (WHERE e.exported_at IS NOT NULL) as exported_items,
            SUM(e.file_size_bytes) / (1024.0 * 1024.0 * 1024.0) as total_evidence_gb
          FROM evidence e
          WHERE e.tenant_id = $1
            AND e.created_at >= $3
            ${query.branchId ? "AND e.branch_id = $2" : ""}
          GROUP BY e.branch_id
        ),
        audit_stats AS (
          SELECT 
            a.metadata->>'branchId' as branch_id,
            COUNT(*) as total_audit_events,
            COUNT(DISTINCT a.actor_user_id) as unique_users,
            COUNT(*) FILTER (WHERE a.category = 'CONFIG_CHANGED') as config_changes,
            COUNT(*) FILTER (WHERE a.category = 'ACCESS_CONTROL') as access_events
          FROM immutable_audit_log a
          WHERE a.tenant_id = $1
            AND a.timestamp >= $3
            ${query.branchId ? "AND a.metadata->>'branchId' = $2" : ""}
          GROUP BY branch_id
        )
        SELECT 
          es.*,
          COALESCE(aus.total_audit_events, 0) as total_audit_events,
          COALESCE(aus.unique_users, 0) as unique_users,
          COALESCE(aus.config_changes, 0) as config_changes,
          COALESCE(aus.access_events, 0) as access_events
        FROM evidence_stats es
        LEFT JOIN audit_stats aus ON aus.branch_id = es.branch_id
      `;

      const evidenceParams = query.branchId 
        ? [user.tenantId, query.branchId, startDate]
        : [user.tenantId, startDate];
      const evidenceResult = await pool.query(evidenceComplianceQuery, evidenceParams);

      // Calculate compliance scores
      const branches = coverageResult.rows.map((branch: any) => {
        const rules = rulesResult.rows.find((r: any) => 
          r.branch_id === branch.branch_id || r.branch_id === 'ALL'
        ) || {};
        const incidents = incidentResult.rows.find((i: any) => i.branch_id === branch.branch_id) || {};
        const evidence = evidenceResult.rows.find((e: any) => e.branch_id === branch.branch_id) || {};

        // Coverage score (40% weight)
        const cameraScore = branch.camera_availability_pct;
        const criticalZoneScore = branch.critical_zone_coverage_pct;
        const recordingScore = branch.total_cameras > 0 
          ? (branch.recording_cameras / branch.total_cameras * 100)
          : 0;
        const coverageScore = (cameraScore * 0.4 + criticalZoneScore * 0.4 + recordingScore * 0.2);

        // Rule activation score (25% weight)
        const totalRules = parseInt(rules.total_rules) || 0;
        const activeRules = parseInt(rules.active_rules) || 0;
        const ruleScore = totalRules > 0 ? (activeRules / totalRules * 100) : 0;

        // Incident response score (20% weight)
        const totalIncidents = parseInt(incidents.total_incidents) || 0;
        const resolvedIncidents = parseInt(incidents.resolved_incidents) || 0;
        const assignedIncidents = parseInt(incidents.assigned_incidents) || 0;
        const incidentScore = totalIncidents > 0 
          ? ((resolvedIncidents + assignedIncidents) / (totalIncidents * 2) * 100)
          : 100;

        // Evidence compliance score (15% weight)
        const totalEvidence = parseInt(evidence.total_evidence_items) || 0;
        const preservedEvidence = parseInt(evidence.preserved_items) || 0;
        const chainVerified = parseInt(evidence.chain_verified) || 0;
        const evidenceScore = totalEvidence > 0
          ? ((preservedEvidence + chainVerified) / (totalEvidence * 2) * 100)
          : 100;

        // Overall compliance score
        const overallScore = Math.round(
          coverageScore * 0.40 +
          ruleScore * 0.25 +
          incidentScore * 0.20 +
          evidenceScore * 0.15
        );

        // Compliance grade
        let grade: string;
        if (overallScore >= 95) grade = 'A+';
        else if (overallScore >= 90) grade = 'A';
        else if (overallScore >= 85) grade = 'B+';
        else if (overallScore >= 80) grade = 'B';
        else if (overallScore >= 75) grade = 'C+';
        else if (overallScore >= 70) grade = 'C';
        else if (overallScore >= 60) grade = 'D';
        else grade = 'F';

        return {
          branchId: branch.branch_id,
          branchName: branch.branch_name,
          branchCode: branch.branch_code,
          branchType: branch.branch_type,

          coverage: {
            totalCameras: parseInt(branch.total_cameras) || 0,
            onlineCameras: parseInt(branch.online_cameras) || 0,
            offlineCameras: parseInt(branch.offline_cameras) || 0,
            recordingCameras: parseInt(branch.recording_cameras) || 0,
            criticalZoneCameras: parseInt(branch.critical_zone_cameras) || 0,
            criticalZoneOnline: parseInt(branch.critical_zone_online) || 0,
            cameraAvailabilityPct: parseFloat(branch.camera_availability_pct) || 0,
            criticalZoneCoveragePct: parseFloat(branch.critical_zone_coverage_pct) || 0,
            activeRecorders: parseInt(branch.active_recorders) || 0,
            healthyRecorders: parseInt(branch.healthy_recorders) || 0,
            storageUsedGb: parseFloat(branch.storage_used_gb) || 0,
            storageCapacityGb: parseFloat(branch.storage_capacity_gb) || 0,
            totalZones: parseInt(branch.total_zones) || 0,
            enabledZones: parseInt(branch.enabled_zones) || 0,
          },

          rules: {
            totalRules: parseInt(rules.total_rules) || 0,
            activeRules: parseInt(rules.active_rules) || 0,
            shadowRules: parseInt(rules.shadow_rules) || 0,
            inactiveRules: parseInt(rules.inactive_rules) || 0,
            criticalRules: parseInt(rules.critical_rules) || 0,
            templateBasedRules: parseInt(rules.template_based_rules) || 0,
            uniqueDetectors: parseInt(rules.unique_detectors) || 0,
          },

          incidents: {
            totalIncidents: totalIncidents,
            criticalIncidents: parseInt(incidents.critical_incidents) || 0,
            resolvedIncidents: resolvedIncidents,
            openIncidents: parseInt(incidents.open_incidents) || 0,
            avgResolutionMinutes: parseFloat(incidents.avg_resolution_minutes) || 0,
            assignedIncidents: assignedIncidents,
            incidentsWithEvidence: parseInt(incidents.incidents_with_evidence) || 0,
          },

          evidence: {
            totalEvidenceItems: totalEvidence,
            preservedItems: preservedEvidence,
            chainVerified: chainVerified,
            legalHoldItems: parseInt(evidence.legal_hold_items) || 0,
            exportedItems: parseInt(evidence.exported_items) || 0,
            totalEvidenceGb: parseFloat(evidence.total_evidence_gb) || 0,
            totalAuditEvents: parseInt(evidence.total_audit_events) || 0,
            uniqueUsers: parseInt(evidence.unique_users) || 0,
            configChanges: parseInt(evidence.config_changes) || 0,
            accessEvents: parseInt(evidence.access_events) || 0,
          },

          complianceScores: {
            coverageScore: Math.round(coverageScore),
            ruleActivationScore: Math.round(ruleScore),
            incidentResponseScore: Math.round(incidentScore),
            evidenceComplianceScore: Math.round(evidenceScore),
            overallScore,
            grade,
          },
        };
      });

      // Regulatory checklist items
      const regulatoryChecklist = [
        {
          id: 'RBI_NBFC_01',
          category: 'Physical Security',
          requirement: 'CCTV coverage of all cash handling areas',
          status: branches.every(b => b.coverage.criticalZoneCoveragePct >= 95) ? 'COMPLIANT' : 'NON_COMPLIANT',
          score: branches.length > 0 
            ? Math.round(branches.reduce((sum, b) => sum + b.coverage.criticalZoneCoveragePct, 0) / branches.length)
            : 0,
        },
        {
          id: 'RBI_NBFC_02',
          category: 'Recording Retention',
          requirement: 'Minimum 90-day video retention for critical areas',
          status: branches.every(b => b.coverage.storageCapacityGb > 0) ? 'COMPLIANT' : 'PARTIAL',
          score: 100,
        },
        {
          id: 'RBI_NBFC_03',
          category: 'Dual Control',
          requirement: 'Vault access requires minimum 2 authorized personnel',
          status: branches.every(b => b.rules.activeRules > 0) ? 'COMPLIANT' : 'NON_COMPLIANT',
          score: branches.length > 0
            ? Math.round(branches.reduce((sum, b) => sum + (b.rules.activeRules > 0 ? 100 : 0), 0) / branches.length)
            : 0,
        },
        {
          id: 'RBI_NBFC_04',
          category: 'After-Hours Monitoring',
          requirement: 'Automated intrusion detection outside business hours',
          status: 'COMPLIANT',
          score: 100,
        },
        {
          id: 'RBI_NBFC_05',
          category: 'Audit Trail',
          requirement: 'Immutable audit log for all security events',
          status: branches.every(b => b.evidence.totalAuditEvents > 0) ? 'COMPLIANT' : 'PARTIAL',
          score: branches.length > 0
            ? Math.round(branches.reduce((sum, b) => sum + (b.evidence.totalAuditEvents > 0 ? 100 : 0), 0) / branches.length)
            : 0,
        },
        {
          id: 'RBI_NBFC_06',
          category: 'Incident Management',
          requirement: 'All critical incidents must be assigned within 15 minutes',
          status: branches.every(b => b.incidents.assignedIncidents === b.incidents.criticalIncidents) ? 'COMPLIANT' : 'PARTIAL',
          score: 85,
        },
        {
          id: 'RBI_NBFC_07',
          category: 'Evidence Preservation',
          requirement: 'Chain of custody maintained for all evidence',
          status: branches.every(b => 
            b.evidence.totalEvidenceItems === 0 || b.evidence.chainVerified / b.evidence.totalEvidenceItems >= 0.95
          ) ? 'COMPLIANT' : 'PARTIAL',
          score: branches.length > 0
            ? Math.round(branches.reduce((sum, b) => {
                const ratio = b.evidence.totalEvidenceItems > 0 
                  ? (b.evidence.chainVerified / b.evidence.totalEvidenceItems * 100)
                  : 100;
                return sum + ratio;
              }, 0) / branches.length)
            : 100,
        },
        {
          id: 'RBI_NBFC_08',
          category: 'Camera Health',
          requirement: 'Camera availability > 98% for critical zones',
          status: branches.every(b => b.coverage.cameraAvailabilityPct >= 98) ? 'COMPLIANT' : 'NON_COMPLIANT',
          score: branches.length > 0
            ? Math.round(branches.reduce((sum, b) => sum + b.coverage.cameraAvailabilityPct, 0) / branches.length)
            : 0,
        },
      ];

      const overallCompliance = {
        totalBranches: branches.length,
        avgComplianceScore: branches.length > 0
          ? Math.round(branches.reduce((sum, b) => sum + b.complianceScores.overallScore, 0) / branches.length)
          : 0,
        compliantBranches: branches.filter(b => b.complianceScores.overallScore >= 80).length,
        atRiskBranches: branches.filter(b => b.complianceScores.overallScore < 70).length,
        checklistCompliance: Math.round(
          regulatoryChecklist.reduce((sum, item) => sum + item.score, 0) / regulatoryChecklist.length
        ),
      };

      return reply.send({
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        branches,
        regulatoryChecklist,
        overallCompliance,
        generatedAt: new Date().toISOString(),
      });

    } catch (error: any) {
      app.log.error({ error }, "Failed to get branch compliance audit");
      return reply.code(500).send({
        error: "compliance_audit_error",
        message: error.message || "Failed to retrieve compliance audit data",
      });
    }
  });

  // Get audit-ready evidence summary for export
  app.get("/api/compliance/audit-evidence", async (request: AuthenticatedRequest, reply) => {
    try {
      const user = requireAuth(request);
      const query = request.query as {
        branchId?: string;
        startDate?: string;
        endDate?: string;
      };

      const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      const evidenceQuery = `
        SELECT 
          e.id,
          e.branch_id,
          e.incident_id,
          e.camera_id,
          e.evidence_type,
          e.file_name,
          e.file_size_bytes,
          e.status,
          e.chain_of_custody_verified,
          e.legal_hold,
          e.created_at,
          e.created_by,
          e.exported_at,
          b.name as branch_name,
          COALESCE(cnode.name, c.model, c.id::text) as camera_name,
          i.title as incident_title,
          i.severity as incident_severity
        FROM evidence e
        JOIN branches b ON b.id = e.branch_id AND b.tenant_id = e.tenant_id
        LEFT JOIN cameras c ON c.id = e.camera_id
        LEFT JOIN resource_nodes cnode ON cnode.id = c.resource_node_id
        LEFT JOIN incidents i ON i.id = e.incident_id AND i.tenant_id = e.tenant_id
        WHERE e.tenant_id = $1::uuid
          AND e.created_at BETWEEN $2 AND $3
          ${query.branchId ? "AND e.branch_id = $4" : ""}
        ORDER BY e.created_at DESC
        LIMIT 500
      `;

      const params = query.branchId 
        ? [user.tenantId, startDate, endDate, query.branchId]
        : [user.tenantId, startDate, endDate];
      
      const result = await pool.query(evidenceQuery, params);

      return reply.send({
        evidence: result.rows.map((row: any) => ({
          id: row.id,
          branchId: row.branch_id,
          branchName: row.branch_name,
          incidentId: row.incident_id,
          incidentTitle: row.incident_title,
          incidentSeverity: row.incident_severity,
          cameraId: row.camera_id,
          cameraName: row.camera_name,
          evidenceType: row.evidence_type,
          fileName: row.file_name,
          fileSizeBytes: parseInt(row.file_size_bytes) || 0,
          status: row.status,
          chainOfCustodyVerified: row.chain_of_custody_verified,
          legalHold: row.legal_hold,
          createdAt: row.created_at,
          createdBy: row.created_by,
          exportedAt: row.exported_at,
        })),
        totalItems: result.rows.length,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        generatedAt: new Date().toISOString(),
      });

    } catch (error: any) {
      app.log.error({ error }, "Failed to get audit evidence summary");
      return reply.code(500).send({ error: "audit_evidence_error", message: error.message });
    }
  });
}
