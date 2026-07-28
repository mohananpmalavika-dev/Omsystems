-- =====================================================
-- Recording Retention Verification Migration
-- =====================================================
-- Purpose: Enable automatic calculation and verification 
-- of actual recording retention against policy requirements
--
-- Features:
-- - Camera retention status tracking
-- - Historical retention verification logs
-- - Compliance alerts for policy violations
-- - Materialized view for dashboard performance
-- =====================================================

-- Table: camera_retention_status
-- Stores current retention status for each camera
CREATE TABLE IF NOT EXISTS camera_retention_status (
    camera_id UUID PRIMARY KEY REFERENCES cameras(id) ON DELETE CASCADE,
    required_retention_days INTEGER NOT NULL,
    actual_retention_days INTEGER NOT NULL DEFAULT 0,
    oldest_recording_date TIMESTAMP,
    newest_recording_date TIMESTAMP,
    total_recordings_gb NUMERIC(10, 2) DEFAULT 0,
    projected_retention_days INTEGER,
    days_until_policy_violation INTEGER,
    compliance_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
    last_verified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    issues JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT check_compliance_status 
        CHECK (compliance_status IN ('compliant', 'warning', 'violation', 'unknown')),
    CONSTRAINT check_retention_days 
        CHECK (required_retention_days >= 0 AND actual_retention_days >= 0)
);

CREATE INDEX idx_camera_retention_status_compliance 
    ON camera_retention_status(compliance_status);
CREATE INDEX idx_camera_retention_status_verified 
    ON camera_retention_status(last_verified_at);
CREATE INDEX idx_camera_retention_status_actual_retention 
    ON camera_retention_status(actual_retention_days);

COMMENT ON TABLE camera_retention_status IS 
    'Current retention status per camera with compliance tracking';
COMMENT ON COLUMN camera_retention_status.actual_retention_days IS 
    'Calculated from oldest to newest recording in days';
COMMENT ON COLUMN camera_retention_status.projected_retention_days IS 
    'Predicted retention based on storage growth';

-- Table: retention_verification_log
-- Historical log of all retention verification checks
CREATE TABLE IF NOT EXISTS retention_verification_log (
    id SERIAL PRIMARY KEY,
    camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    verified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    required_retention_days INTEGER NOT NULL,
    actual_retention_days INTEGER NOT NULL,
    oldest_recording_date TIMESTAMP,
    newest_recording_date TIMESTAMP,
    total_recordings_gb NUMERIC(10, 2),
    average_bitrate_mbps NUMERIC(8, 2),
    projected_retention_days INTEGER,
    compliance_status VARCHAR(20) NOT NULL,
    issues JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT check_log_compliance_status 
        CHECK (compliance_status IN ('compliant', 'warning', 'violation', 'unknown'))
);

CREATE INDEX idx_retention_verification_log_camera 
    ON retention_verification_log(camera_id, verified_at DESC);
CREATE INDEX idx_retention_verification_log_verified 
    ON retention_verification_log(verified_at DESC);
CREATE INDEX idx_retention_verification_log_compliance 
    ON retention_verification_log(compliance_status, verified_at DESC);

COMMENT ON TABLE retention_verification_log IS 
    'Historical retention verification records for trend analysis';

-- Table: retention_compliance_alerts
-- Alerts for retention policy violations
CREATE TABLE IF NOT EXISTS retention_compliance_alerts (
    id SERIAL PRIMARY KEY,
    camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    alert_type VARCHAR(50) NOT NULL DEFAULT 'retention_policy_violation',
    severity VARCHAR(20) NOT NULL DEFAULT 'high',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(255),
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT check_alert_severity 
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT check_alert_status 
        CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed'))
);

CREATE INDEX idx_retention_alerts_camera 
    ON retention_compliance_alerts(camera_id, created_at DESC);
CREATE INDEX idx_retention_alerts_branch 
    ON retention_compliance_alerts(branch_id, status);
CREATE INDEX idx_retention_alerts_status 
    ON retention_compliance_alerts(status, severity);
CREATE INDEX idx_retention_alerts_created 
    ON retention_compliance_alerts(created_at DESC);

COMMENT ON TABLE retention_compliance_alerts IS 
    'Alerts for cameras violating retention policies';

-- Materialized View: retention_compliance_summary
-- Pre-aggregated branch-level compliance summary for dashboard performance
CREATE MATERIALIZED VIEW IF NOT EXISTS retention_compliance_summary AS
SELECT 
    b.id as branch_id,
    b.name as branch_name,
    b.tenant_id,
    COUNT(DISTINCT c.id) as total_cameras,
    COUNT(DISTINCT CASE 
        WHEN crs.compliance_status = 'compliant' THEN c.id 
    END) as compliant_cameras,
    COUNT(DISTINCT CASE 
        WHEN crs.compliance_status = 'warning' THEN c.id 
    END) as warning_cameras,
    COUNT(DISTINCT CASE 
        WHEN crs.compliance_status = 'violation' THEN c.id 
    END) as violation_cameras,
    COUNT(DISTINCT CASE 
        WHEN crs.compliance_status = 'unknown' THEN c.id 
    END) as unknown_cameras,
    ROUND(AVG(crs.actual_retention_days), 1) as avg_actual_retention_days,
    ROUND(AVG(crs.required_retention_days), 1) as avg_required_retention_days,
    MIN(crs.actual_retention_days) as min_retention_days,
    MAX(crs.actual_retention_days) as max_retention_days,
    ROUND(
        CASE 
            WHEN COUNT(DISTINCT c.id) > 0 
            THEN (COUNT(DISTINCT CASE 
                WHEN crs.compliance_status = 'compliant' THEN c.id 
            END)::NUMERIC / COUNT(DISTINCT c.id)::NUMERIC) * 100
            ELSE 0 
        END, 
        2
    ) as compliance_percentage,
    SUM(crs.total_recordings_gb) as total_recordings_gb,
    MAX(crs.last_verified_at) as last_verification_time,
    NOW() as refreshed_at
FROM resource_nodes b
LEFT JOIN cameras c ON c.branch_node_id = b.id AND c.status != 'disabled'
LEFT JOIN camera_retention_status crs ON crs.camera_id = c.id
WHERE b.type = 'branch'
GROUP BY b.id, b.name, b.tenant_id;

CREATE UNIQUE INDEX idx_retention_summary_branch 
    ON retention_compliance_summary(branch_id);
CREATE INDEX idx_retention_summary_tenant 
    ON retention_compliance_summary(tenant_id);
CREATE INDEX idx_retention_summary_compliance 
    ON retention_compliance_summary(compliance_percentage);

COMMENT ON MATERIALIZED VIEW retention_compliance_summary IS 
    'Branch-level retention compliance summary for dashboard';

-- Function: refresh_retention_compliance_summary()
-- Refresh materialized view for latest data
CREATE OR REPLACE FUNCTION refresh_retention_compliance_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY retention_compliance_summary;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_retention_compliance_summary() IS 
    'Refresh retention compliance summary materialized view';

-- Function: get_camera_retention_trend()
-- Get retention trend for a camera over time
CREATE OR REPLACE FUNCTION get_camera_retention_trend(
    p_camera_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
    date DATE,
    actual_retention_days INTEGER,
    required_retention_days INTEGER,
    compliance_status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(verified_at) as date,
        actual_retention_days,
        required_retention_days,
        compliance_status
    FROM retention_verification_log
    WHERE camera_id = p_camera_id
        AND verified_at >= NOW() - (p_days || ' days')::INTERVAL
    ORDER BY verified_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_camera_retention_trend(UUID, INTEGER) IS 
    'Get retention trend data for a specific camera';

-- Function: calculate_retention_uptime()
-- Calculate retention compliance uptime percentage
CREATE OR REPLACE FUNCTION calculate_retention_uptime(
    p_camera_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS NUMERIC AS $$
DECLARE
    v_uptime NUMERIC;
BEGIN
    SELECT 
        ROUND(
            (COUNT(CASE 
                WHEN compliance_status IN ('compliant', 'warning') THEN 1 
            END)::NUMERIC / COUNT(*)::NUMERIC) * 100,
            2
        )
    INTO v_uptime
    FROM retention_verification_log
    WHERE camera_id = p_camera_id
        AND verified_at >= NOW() - (p_days || ' days')::INTERVAL;
    
    RETURN COALESCE(v_uptime, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_retention_uptime(UUID, INTEGER) IS 
    'Calculate percentage of time camera met retention policy';

-- Trigger: update_retention_status_timestamp
-- Auto-update updated_at on camera_retention_status changes
CREATE OR REPLACE FUNCTION update_retention_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_retention_status_timestamp
    BEFORE UPDATE ON camera_retention_status
    FOR EACH ROW
    EXECUTE FUNCTION update_retention_status_timestamp();

-- Trigger: update_retention_alert_timestamp
-- Auto-update updated_at on retention_compliance_alerts changes
CREATE OR REPLACE FUNCTION update_retention_alert_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_retention_alert_timestamp
    BEFORE UPDATE ON retention_compliance_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_retention_alert_timestamp();

-- =====================================================
-- Sample Data and Testing Queries
-- =====================================================

-- Query: Find cameras with retention violations
-- SELECT 
--     c.name as camera_name,
--     b.name as branch_name,
--     crs.required_retention_days,
--     crs.actual_retention_days,
--     crs.compliance_status,
--     crs.days_until_policy_violation
-- FROM camera_retention_status crs
-- JOIN cameras c ON c.id = crs.camera_id
-- JOIN resource_nodes b ON b.id = c.branch_node_id
-- WHERE crs.compliance_status IN ('violation', 'warning')
-- ORDER BY crs.actual_retention_days ASC;

-- Query: Branch compliance dashboard
-- SELECT * FROM retention_compliance_summary
-- ORDER BY compliance_percentage ASC;

-- Query: Retention trend for specific camera
-- SELECT * FROM get_camera_retention_trend(
--     'camera-uuid-here'::uuid,
--     30
-- );

-- Query: Calculate retention uptime
-- SELECT calculate_retention_uptime(
--     'camera-uuid-here'::uuid,
--     30
-- ) as uptime_percentage;

-- =====================================================
-- Migration Complete
-- =====================================================
-- Tables Created: 3
--   - camera_retention_status (current status)
--   - retention_verification_log (historical log)
--   - retention_compliance_alerts (violation alerts)
--
-- Views Created: 1
--   - retention_compliance_summary (materialized)
--
-- Functions Created: 3
--   - refresh_retention_compliance_summary()
--   - get_camera_retention_trend()
--   - calculate_retention_uptime()
--
-- Triggers Created: 2
--   - Auto-update timestamps on status and alerts
-- =====================================================
