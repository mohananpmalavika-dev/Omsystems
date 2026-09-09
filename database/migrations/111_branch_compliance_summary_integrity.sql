-- Make the branch compliance dashboard deterministic, tenant-scoped, and safe
-- when a branch has not yet produced health, recording, storage, or quality data.
CREATE OR REPLACE VIEW branch_compliance_summary AS
WITH camera_metrics AS (
  SELECT
    branch.tenant_id,
    c.branch_node_id,
    COUNT(*) AS total_cameras,
    COUNT(*) FILTER (WHERE chl.is_online = true) AS online_cameras,
    COUNT(*) FILTER (WHERE chl.is_recording = true) AS recording_cameras,
    COUNT(*) FILTER (WHERE chl.overall_status = 'healthy') AS healthy_cameras,
    COUNT(*) FILTER (WHERE chl.overall_status IN ('critical', 'offline')) AS critical_cameras
  FROM cameras c
  JOIN resource_nodes branch ON branch.id = c.branch_node_id
  LEFT JOIN camera_health_latest chl ON chl.camera_id = c.id
  GROUP BY branch.tenant_id, c.branch_node_id
), recording_metrics AS (
  SELECT
    rv.tenant_id,
    rv.branch_node_id,
    AVG(rv.recording_availability_percentage) AS avg_recording_availability,
    COUNT(*) FILTER (WHERE rv.verification_status = 'compliant') AS compliant_recordings,
    COUNT(*) FILTER (WHERE rv.verification_status = 'non_compliant') AS non_compliant_recordings
  FROM recording_verification_jobs rv
  WHERE rv.verification_date >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY rv.tenant_id, rv.branch_node_id
), storage_metrics AS (
  SELECT
    sh.tenant_id,
    sh.branch_node_id,
    AVG(sh.utilization_percentage) AS avg_storage_utilization,
    MIN(sh.estimated_days_until_full) AS min_days_until_full
  FROM storage_health_checks sh
  WHERE sh.check_timestamp >= now() - INTERVAL '24 hours'
  GROUP BY sh.tenant_id, sh.branch_node_id
), maintenance_metrics AS (
  SELECT
    mw.tenant_id,
    mw.branch_node_id,
    COUNT(*) FILTER (WHERE mw.status = 'open') AS open_work_orders,
    COUNT(*) FILTER (WHERE mw.priority IN ('urgent', 'emergency') AND mw.status NOT IN ('completed', 'closed', 'cancelled')) AS urgent_work_orders
  FROM maintenance_work_orders mw
  GROUP BY mw.tenant_id, mw.branch_node_id
), quality_metrics AS (
  SELECT
    cq.tenant_id,
    cq.branch_node_id,
    AVG(cq.overall_quality_score) AS avg_quality_score
  FROM camera_quality_checks cq
  WHERE cq.check_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY cq.tenant_id, cq.branch_node_id
)
SELECT
  n.id AS branch_id,
  n.tenant_id,
  n.name AS branch_name,
  COALESCE(cm.total_cameras, 0) AS total_cameras,
  COALESCE(cm.online_cameras, 0) AS online_cameras,
  COALESCE(cm.recording_cameras, 0) AS recording_cameras,
  COALESCE(cm.healthy_cameras, 0) AS healthy_cameras,
  COALESCE(cm.critical_cameras, 0) AS critical_cameras,
  COALESCE(rm.avg_recording_availability, 0) AS avg_recording_availability,
  COALESCE(rm.compliant_recordings, 0) AS compliant_recordings,
  COALESCE(rm.non_compliant_recordings, 0) AS non_compliant_recordings,
  COALESCE(sm.avg_storage_utilization, 0) AS avg_storage_utilization,
  sm.min_days_until_full,
  COALESCE(mm.open_work_orders, 0) AS open_work_orders,
  COALESCE(mm.urgent_work_orders, 0) AS urgent_work_orders,
  COALESCE(qm.avg_quality_score, 0) AS avg_quality_score,
  ROUND((
    COALESCE(cm.online_cameras::numeric / NULLIF(cm.total_cameras, 0) * 30, 0) +
    COALESCE(rm.avg_recording_availability, 0) * 0.4 +
    COALESCE(qm.avg_quality_score, 0) * 0.3
  ), 2) AS overall_compliance_score,
  n.code AS branch_code
FROM resource_nodes n
LEFT JOIN camera_metrics cm ON cm.tenant_id = n.tenant_id AND cm.branch_node_id = n.id
LEFT JOIN recording_metrics rm ON rm.tenant_id = n.tenant_id AND rm.branch_node_id = n.id
LEFT JOIN storage_metrics sm ON sm.tenant_id = n.tenant_id AND sm.branch_node_id = n.id
LEFT JOIN maintenance_metrics mm ON mm.tenant_id = n.tenant_id AND mm.branch_node_id = n.id
LEFT JOIN quality_metrics qm ON qm.tenant_id = n.tenant_id AND qm.branch_node_id = n.id
WHERE n.node_type = 'branch';
