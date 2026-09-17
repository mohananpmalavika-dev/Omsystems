-- ============================================================================
-- Migration 005: Comprehensive Audit Logging Schema
-- ============================================================================
-- Purpose: Track all report access, exports, and sensitive operations
-- Date: September 17, 2026
-- Dependencies: Users table, RBAC schema (migration 004)
-- Impact: Enables complete audit trail for compliance (RBI, GDPR, SOX)
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Report Access Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User information
  user_id UUID NOT NULL,
  user_email VARCHAR(255),
  user_name VARCHAR(255),
  user_role VARCHAR(50),
  
  -- Report information
  report_type VARCHAR(100) NOT NULL, -- 'executive-kpi', 'financial-tco', etc.
  report_category VARCHAR(50), -- 'executive', 'financial', 'operational', 'compliance'
  action VARCHAR(50) NOT NULL, -- 'view', 'export_pdf', 'export_excel', 'schedule', 'favorite'
  
  -- Request details
  filters JSONB, -- Filters applied (date range, branches, etc.)
  result_count INT, -- Number of records returned
  duration_ms INT, -- Report generation time in milliseconds
  
  -- Technical details
  ip_address INET,
  user_agent TEXT,
  request_id UUID, -- For correlation with application logs
  session_id VARCHAR(255),
  
  -- Status and metadata
  status VARCHAR(20) DEFAULT 'success', -- 'success', 'error', 'denied', 'timeout'
  error_message TEXT,
  
  -- Timestamps
  accessed_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key to users (soft reference, don't cascade delete)
  CONSTRAINT fk_user_reference CHECK (user_id IS NOT NULL)
);

-- Indexes for fast queries
CREATE INDEX idx_report_access_user ON report_access_log(user_id, accessed_at DESC);
CREATE INDEX idx_report_access_type ON report_access_log(report_type, accessed_at DESC);
CREATE INDEX idx_report_access_date ON report_access_log(accessed_at DESC);
CREATE INDEX idx_report_access_action ON report_access_log(action, accessed_at DESC);
CREATE INDEX idx_report_access_status ON report_access_log(status) WHERE status != 'success';
CREATE INDEX idx_report_access_user_role ON report_access_log(user_role, report_type);

-- Partial index for denied access (security monitoring)
CREATE INDEX idx_report_access_denied ON report_access_log(user_id, report_type, accessed_at DESC) 
  WHERE status = 'denied';

-- ============================================================================
-- STEP 2: Partition Table by Month (for performance)
-- ============================================================================

-- Convert to partitioned table (PostgreSQL 10+)
-- Note: If table already has data, this requires migration

-- Create partition for September 2026
CREATE TABLE IF NOT EXISTS report_access_log_2026_09 PARTITION OF report_access_log
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Create partition for October 2026
CREATE TABLE IF NOT EXISTS report_access_log_2026_10 PARTITION OF report_access_log
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

-- Create partition for November 2026
CREATE TABLE IF NOT EXISTS report_access_log_2026_11 PARTITION OF report_access_log
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

-- Create partition for December 2026
CREATE TABLE IF NOT EXISTS report_access_log_2026_12 PARTITION OF report_access_log
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- ============================================================================
-- STEP 3: Create Function to Auto-Create Future Partitions
-- ============================================================================

CREATE OR REPLACE FUNCTION create_report_access_partition()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  start_date TEXT;
  end_date TEXT;
BEGIN
  -- Create partitions for next 3 months
  FOR i IN 0..2 LOOP
    partition_date := DATE_TRUNC('month', NOW() + (i || ' months')::INTERVAL)::DATE;
    partition_name := 'report_access_log_' || TO_CHAR(partition_date, 'YYYY_MM');
    start_date := TO_CHAR(partition_date, 'YYYY-MM-DD');
    end_date := TO_CHAR(partition_date + INTERVAL '1 month', 'YYYY-MM-DD');
    
    -- Check if partition exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF report_access_log FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
      );
      RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run initial partition creation
SELECT create_report_access_partition();

-- ============================================================================
-- STEP 4: Create Audit Summary Views
-- ============================================================================

-- View: Report Access Summary by User
CREATE OR REPLACE VIEW v_report_access_by_user AS
SELECT 
  user_id,
  user_email,
  user_role,
  COUNT(*) as total_accesses,
  COUNT(*) FILTER (WHERE action = 'view') as views,
  COUNT(*) FILTER (WHERE action LIKE 'export_%') as exports,
  COUNT(*) FILTER (WHERE status = 'denied') as denied_attempts,
  COUNT(DISTINCT report_type) as unique_reports_accessed,
  AVG(duration_ms) as avg_duration_ms,
  MAX(accessed_at) as last_access,
  MIN(accessed_at) as first_access
FROM report_access_log
WHERE accessed_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id, user_email, user_role
ORDER BY total_accesses DESC;

-- View: Report Access Summary by Report Type
CREATE OR REPLACE VIEW v_report_access_by_type AS
SELECT 
  report_type,
  report_category,
  COUNT(*) as total_accesses,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE action = 'view') as views,
  COUNT(*) FILTER (WHERE action LIKE 'export_%') as exports,
  COUNT(*) FILTER (WHERE status = 'denied') as denied_attempts,
  AVG(duration_ms) as avg_duration_ms,
  MAX(accessed_at) as last_access
FROM report_access_log
WHERE accessed_at >= NOW() - INTERVAL '30 days'
GROUP BY report_type, report_category
ORDER BY total_accesses DESC;

-- View: Suspicious Access Patterns (Security Monitoring)
CREATE OR REPLACE VIEW v_suspicious_access_patterns AS
SELECT 
  user_id,
  user_email,
  user_role,
  COUNT(*) as denied_attempts,
  COUNT(DISTINCT report_type) as unique_reports_attempted,
  COUNT(DISTINCT ip_address) as unique_ips,
  MAX(accessed_at) as last_attempt,
  ARRAY_AGG(DISTINCT report_type) as attempted_reports
FROM report_access_log
WHERE status = 'denied'
  AND accessed_at >= NOW() - INTERVAL '7 days'
GROUP BY user_id, user_email, user_role
HAVING COUNT(*) >= 5 -- 5+ denied attempts
ORDER BY denied_attempts DESC;

-- View: Audit Trail for Compliance (Last 90 Days)
CREATE OR REPLACE VIEW v_audit_trail_compliance AS
SELECT 
  accessed_at,
  user_email,
  user_role,
  report_type,
  action,
  filters,
  ip_address,
  status,
  duration_ms
FROM report_access_log
WHERE accessed_at >= NOW() - INTERVAL '90 days'
ORDER BY accessed_at DESC;

-- ============================================================================
-- STEP 5: Create Helper Functions
-- ============================================================================

-- Function: Log report access
CREATE OR REPLACE FUNCTION log_report_access(
  p_user_id UUID,
  p_user_email VARCHAR,
  p_user_name VARCHAR,
  p_user_role VARCHAR,
  p_report_type VARCHAR,
  p_report_category VARCHAR,
  p_action VARCHAR,
  p_filters JSONB DEFAULT NULL,
  p_result_count INT DEFAULT NULL,
  p_duration_ms INT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_session_id VARCHAR DEFAULT NULL,
  p_status VARCHAR DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO report_access_log (
    user_id, user_email, user_name, user_role,
    report_type, report_category, action,
    filters, result_count, duration_ms,
    ip_address, user_agent, request_id, session_id,
    status, error_message
  ) VALUES (
    p_user_id, p_user_email, p_user_name, p_user_role,
    p_report_type, p_report_category, p_action,
    p_filters, p_result_count, p_duration_ms,
    p_ip_address, p_user_agent, p_request_id, p_session_id,
    p_status, p_error_message
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user's access history
CREATE OR REPLACE FUNCTION get_user_access_history(
  p_user_id UUID,
  p_days INT DEFAULT 30
) RETURNS TABLE(
  accessed_at TIMESTAMP,
  report_type VARCHAR,
  action VARCHAR,
  status VARCHAR,
  duration_ms INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ral.accessed_at,
    ral.report_type,
    ral.action,
    ral.status,
    ral.duration_ms
  FROM report_access_log ral
  WHERE ral.user_id = p_user_id
    AND ral.accessed_at >= NOW() - (p_days || ' days')::INTERVAL
  ORDER BY ral.accessed_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Check for unusual access patterns
CREATE OR REPLACE FUNCTION detect_unusual_access(
  p_user_id UUID,
  p_threshold INT DEFAULT 10
) RETURNS BOOLEAN AS $$
DECLARE
  access_count INT;
  denied_count INT;
BEGIN
  -- Count accesses in last hour
  SELECT COUNT(*) INTO access_count
  FROM report_access_log
  WHERE user_id = p_user_id
    AND accessed_at >= NOW() - INTERVAL '1 hour';
  
  -- Count denied attempts in last hour
  SELECT COUNT(*) INTO denied_count
  FROM report_access_log
  WHERE user_id = p_user_id
    AND accessed_at >= NOW() - INTERVAL '1 hour'
    AND status = 'denied';
  
  -- Return true if unusual pattern detected
  RETURN (access_count > p_threshold OR denied_count >= 3);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Create Audit Retention Policy Function
-- ============================================================================

-- Function: Archive old audit logs (keep 7 years for compliance)
CREATE OR REPLACE FUNCTION archive_old_audit_logs()
RETURNS void AS $$
DECLARE
  archived_count INT;
BEGIN
  -- Move logs older than 2 years to archive table
  WITH archived AS (
    DELETE FROM report_access_log
    WHERE accessed_at < NOW() - INTERVAL '2 years'
    RETURNING *
  )
  SELECT COUNT(*) INTO archived_count FROM archived;
  
  RAISE NOTICE 'Archived % old audit log entries', archived_count;
END;
$$ LANGUAGE plpgsql;

-- Note: Schedule this function to run monthly via cron or pg_cron

-- ============================================================================
-- STEP 7: Create Alert Triggers for Security Events
-- ============================================================================

-- Function: Alert on suspicious access patterns
CREATE OR REPLACE FUNCTION alert_suspicious_access()
RETURNS TRIGGER AS $$
DECLARE
  denied_count INT;
BEGIN
  -- Check recent denied attempts by this user
  SELECT COUNT(*) INTO denied_count
  FROM report_access_log
  WHERE user_id = NEW.user_id
    AND status = 'denied'
    AND accessed_at >= NOW() - INTERVAL '1 hour';
  
  -- If 5+ denied attempts in 1 hour, log alert
  IF denied_count >= 5 THEN
    RAISE WARNING 'Suspicious access pattern detected for user %: % denied attempts in 1 hour',
      NEW.user_email, denied_count;
    
    -- Could integrate with external alerting system here
    -- e.g., call webhook, send email, create incident ticket
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_alert_suspicious_access
  AFTER INSERT ON report_access_log
  FOR EACH ROW
  WHEN (NEW.status = 'denied')
  EXECUTE FUNCTION alert_suspicious_access();

-- ============================================================================
-- STEP 8: Create Audit Statistics Table (Daily Aggregation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_statistics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  report_type VARCHAR(100),
  user_role VARCHAR(50),
  
  -- Metrics
  total_accesses INT DEFAULT 0,
  unique_users INT DEFAULT 0,
  views INT DEFAULT 0,
  exports INT DEFAULT 0,
  denied_attempts INT DEFAULT 0,
  avg_duration_ms NUMERIC(10,2),
  max_duration_ms INT,
  
  -- Timestamps
  calculated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(date, report_type, user_role)
);

CREATE INDEX idx_audit_stats_date ON audit_statistics_daily(date DESC);
CREATE INDEX idx_audit_stats_type ON audit_statistics_daily(report_type, date DESC);

-- Function: Calculate daily statistics
CREATE OR REPLACE FUNCTION calculate_daily_audit_statistics(p_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_statistics_daily (
    date, report_type, user_role,
    total_accesses, unique_users, views, exports, denied_attempts,
    avg_duration_ms, max_duration_ms
  )
  SELECT 
    p_date,
    report_type,
    user_role,
    COUNT(*) as total_accesses,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE action = 'view') as views,
    COUNT(*) FILTER (WHERE action LIKE 'export_%') as exports,
    COUNT(*) FILTER (WHERE status = 'denied') as denied_attempts,
    ROUND(AVG(duration_ms), 2) as avg_duration_ms,
    MAX(duration_ms) as max_duration_ms
  FROM report_access_log
  WHERE DATE(accessed_at) = p_date
  GROUP BY report_type, user_role
  ON CONFLICT (date, report_type, user_role) 
  DO UPDATE SET
    total_accesses = EXCLUDED.total_accesses,
    unique_users = EXCLUDED.unique_users,
    views = EXCLUDED.views,
    exports = EXCLUDED.exports,
    denied_attempts = EXCLUDED.denied_attempts,
    avg_duration_ms = EXCLUDED.avg_duration_ms,
    max_duration_ms = EXCLUDED.max_duration_ms,
    calculated_at = NOW();
  
  RAISE NOTICE 'Calculated daily statistics for %', p_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 9: Create Compliance Report Functions
-- ============================================================================

-- Function: Generate compliance audit report
CREATE OR REPLACE FUNCTION generate_compliance_audit_report(
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE(
  date DATE,
  total_accesses BIGINT,
  unique_users BIGINT,
  financial_accesses BIGINT,
  compliance_accesses BIGINT,
  denied_attempts BIGINT,
  avg_response_time_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(accessed_at) as date,
    COUNT(*) as total_accesses,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE report_category = 'financial') as financial_accesses,
    COUNT(*) FILTER (WHERE report_category = 'compliance') as compliance_accesses,
    COUNT(*) FILTER (WHERE status = 'denied') as denied_attempts,
    ROUND(AVG(duration_ms), 2) as avg_response_time_ms
  FROM report_access_log
  WHERE accessed_at::DATE BETWEEN p_start_date AND p_end_date
  GROUP BY DATE(accessed_at)
  ORDER BY DATE(accessed_at);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 10: Create Sample Queries for Common Audit Tasks
-- ============================================================================

-- Query 1: Who accessed financial reports in the last 7 days?
COMMENT ON VIEW v_report_access_by_user IS 
'Query: SELECT * FROM v_report_access_by_user WHERE user_role IN (''cfo'', ''ceo'', ''finance_analyst'')';

-- Query 2: What reports did a specific user access?
COMMENT ON FUNCTION get_user_access_history IS
'Usage: SELECT * FROM get_user_access_history(''user-id-here'', 30)';

-- Query 3: Detect unusual access patterns
COMMENT ON FUNCTION detect_unusual_access IS
'Usage: SELECT detect_unusual_access(''user-id-here'', 10)';

-- Query 4: Compliance audit report for last quarter
COMMENT ON FUNCTION generate_compliance_audit_report IS
'Usage: SELECT * FROM generate_compliance_audit_report(''2026-07-01'', ''2026-09-30'')';

-- ============================================================================
-- STEP 11: Grant Permissions
-- ============================================================================

-- Grant access to audit views for compliance officers
-- GRANT SELECT ON v_report_access_by_user TO compliance_role;
-- GRANT SELECT ON v_report_access_by_type TO compliance_role;
-- GRANT SELECT ON v_suspicious_access_patterns TO compliance_role;
-- GRANT SELECT ON v_audit_trail_compliance TO compliance_role;

-- ============================================================================
-- STEP 12: Create Migration Verification Queries
-- ============================================================================

DO $$
BEGIN
  -- Verify table created
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'report_access_log') THEN
    RAISE EXCEPTION 'Table report_access_log not created';
  END IF;
  
  -- Verify partitions created
  IF (SELECT COUNT(*) FROM pg_tables WHERE tablename LIKE 'report_access_log_2026_%') < 4 THEN
    RAISE WARNING 'Expected 4+ partitions, found fewer';
  END IF;
  
  -- Verify views created
  IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_report_access_by_user') THEN
    RAISE EXCEPTION 'View v_report_access_by_user not created';
  END IF;
  
  RAISE NOTICE '✓ Audit logging schema verified successfully';
END $$;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
-- 
-- DROP TRIGGER IF EXISTS trigger_alert_suspicious_access ON report_access_log;
-- DROP FUNCTION IF EXISTS alert_suspicious_access();
-- DROP FUNCTION IF EXISTS archive_old_audit_logs();
-- DROP FUNCTION IF EXISTS detect_unusual_access(UUID, INT);
-- DROP FUNCTION IF EXISTS get_user_access_history(UUID, INT);
-- DROP FUNCTION IF EXISTS log_report_access(...);
-- DROP FUNCTION IF EXISTS calculate_daily_audit_statistics(DATE);
-- DROP FUNCTION IF EXISTS generate_compliance_audit_report(DATE, DATE);
-- DROP FUNCTION IF EXISTS create_report_access_partition();
-- DROP VIEW IF EXISTS v_report_access_by_user;
-- DROP VIEW IF EXISTS v_report_access_by_type;
-- DROP VIEW IF EXISTS v_suspicious_access_patterns;
-- DROP VIEW IF EXISTS v_audit_trail_compliance;
-- DROP TABLE IF EXISTS audit_statistics_daily;
-- DROP TABLE IF EXISTS report_access_log_2026_12;
-- DROP TABLE IF EXISTS report_access_log_2026_11;
-- DROP TABLE IF EXISTS report_access_log_2026_10;
-- DROP TABLE IF EXISTS report_access_log_2026_09;
-- DROP TABLE IF EXISTS report_access_log;

-- ============================================================================
-- END OF MIGRATION 005
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 005: Audit Logging - COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - report_access_log table (partitioned)';
  RAISE NOTICE '  - 4 summary views';
  RAISE NOTICE '  - 7 helper functions';
  RAISE NOTICE '  - Security alert trigger';
  RAISE NOTICE '  - Daily statistics aggregation';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  - Complete audit trail for all reports';
  RAISE NOTICE '  - Automatic partition management';
  RAISE NOTICE '  - Suspicious access detection';
  RAISE NOTICE '  - Compliance reporting (7-year retention)';
  RAISE NOTICE '  - Performance optimized (partitioned, indexed)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Integrate audit-logger middleware';
  RAISE NOTICE '  2. Create audit dashboard UI';
  RAISE NOTICE '  3. Schedule daily statistics job';
  RAISE NOTICE '========================================';
END $$;
