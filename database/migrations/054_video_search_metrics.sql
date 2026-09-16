-- ============================================================================
-- Video Search Metrics Tables
-- ============================================================================
-- Stores historical metrics for monitoring and analytics

-- Hourly aggregated metrics
CREATE TABLE IF NOT EXISTS video_search_metrics_hourly (
    timestamp TIMESTAMPTZ PRIMARY KEY,
    total_searches INTEGER NOT NULL DEFAULT 0,
    successful_searches INTEGER NOT NULL DEFAULT 0,
    failed_searches INTEGER NOT NULL DEFAULT 0,
    avg_response_time_ms NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p95_response_time_ms NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p99_response_time_ms NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_errors INTEGER NOT NULL DEFAULT 0,
    error_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    throughput_per_minute NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_search_metrics_hourly_timestamp
    ON video_search_metrics_hourly(timestamp DESC);

-- Query analytics
CREATE TABLE IF NOT EXISTS video_search_query_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    query_hash VARCHAR(64) NOT NULL,
    query_text TEXT NOT NULL,
    query_type VARCHAR(50) NOT NULL,
    execution_count INTEGER NOT NULL DEFAULT 1,
    total_response_time_ms BIGINT NOT NULL DEFAULT 0,
    avg_response_time_ms NUMERIC(10, 2) NOT NULL DEFAULT 0,
    min_response_time_ms INTEGER NOT NULL DEFAULT 0,
    max_response_time_ms INTEGER NOT NULL DEFAULT 0,
    last_executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id, query_hash)
);

CREATE INDEX IF NOT EXISTS idx_video_search_query_analytics_tenant
    ON video_search_query_analytics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_search_query_analytics_type
    ON video_search_query_analytics(query_type);
CREATE INDEX IF NOT EXISTS idx_video_search_query_analytics_count
    ON video_search_query_analytics(execution_count DESC);

-- Error logs
CREATE TABLE IF NOT EXISTS video_search_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_code VARCHAR(50),
    endpoint VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    stack_trace TEXT,
    request_payload JSONB,
    user_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_video_search_error_logs_tenant
    ON video_search_error_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_search_error_logs_type
    ON video_search_error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_video_search_error_logs_severity
    ON video_search_error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_video_search_error_logs_occurred_at
    ON video_search_error_logs(occurred_at DESC);

-- SLA monitoring
CREATE TABLE IF NOT EXISTS video_search_sla_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    metric_date DATE NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    successful_requests INTEGER NOT NULL DEFAULT 0,
    failed_requests INTEGER NOT NULL DEFAULT 0,
    avg_response_time_ms NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p95_response_time_ms NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p99_response_time_ms NUMERIC(10, 2) NOT NULL DEFAULT 0,
    availability_percent NUMERIC(5, 2) NOT NULL DEFAULT 100,
    sla_met BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_video_search_sla_metrics_tenant
    ON video_search_sla_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_search_sla_metrics_date
    ON video_search_sla_metrics(metric_date DESC);

-- Indexing job metrics (enhancing existing table)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'video_indexing_queue' 
                   AND column_name = 'objects_indexed') THEN
        ALTER TABLE video_indexing_queue 
        ADD COLUMN objects_indexed INTEGER DEFAULT 0,
        ADD COLUMN processing_time_ms INTEGER;
    END IF;
END $$;

-- Auto-cleanup old metrics (retain 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
    DELETE FROM video_search_metrics_hourly WHERE timestamp < NOW() - INTERVAL '90 days';
    DELETE FROM video_search_query_analytics WHERE updated_at < NOW() - INTERVAL '90 days';
    DELETE FROM video_search_error_logs WHERE occurred_at < NOW() - INTERVAL '90 days';
    DELETE FROM video_search_sla_metrics WHERE metric_date < CURRENT_DATE - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Function to update query analytics
CREATE OR REPLACE FUNCTION update_query_analytics(
    p_tenant_id UUID,
    p_query_text TEXT,
    p_query_type VARCHAR(50),
    p_response_time_ms INTEGER
)
RETURNS void AS $$
DECLARE
    v_query_hash VARCHAR(64);
BEGIN
    v_query_hash := encode(digest(p_query_text, 'sha256'), 'hex');
    
    INSERT INTO video_search_query_analytics (
        tenant_id, query_hash, query_text, query_type,
        execution_count, total_response_time_ms, avg_response_time_ms,
        min_response_time_ms, max_response_time_ms,
        first_executed_at, last_executed_at
    ) VALUES (
        p_tenant_id, v_query_hash, p_query_text, p_query_type,
        1, p_response_time_ms, p_response_time_ms,
        p_response_time_ms, p_response_time_ms,
        NOW(), NOW()
    )
    ON CONFLICT (tenant_id, query_hash) DO UPDATE SET
        execution_count = video_search_query_analytics.execution_count + 1,
        total_response_time_ms = video_search_query_analytics.total_response_time_ms + p_response_time_ms,
        avg_response_time_ms = (video_search_query_analytics.total_response_time_ms + p_response_time_ms) / 
                               (video_search_query_analytics.execution_count + 1),
        min_response_time_ms = LEAST(video_search_query_analytics.min_response_time_ms, p_response_time_ms),
        max_response_time_ms = GREATEST(video_search_query_analytics.max_response_time_ms, p_response_time_ms),
        last_executed_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- View for daily SLA summary
CREATE OR REPLACE VIEW video_search_sla_summary AS
SELECT 
    tenant_id,
    metric_date,
    total_requests,
    successful_requests,
    failed_requests,
    ROUND((successful_requests::NUMERIC / NULLIF(total_requests, 0)) * 100, 2) as success_rate,
    avg_response_time_ms,
    p95_response_time_ms,
    p99_response_time_ms,
    availability_percent,
    sla_met,
    CASE 
        WHEN sla_met AND availability_percent >= 99.9 THEN 'excellent'
        WHEN sla_met AND availability_percent >= 99.0 THEN 'good'
        WHEN sla_met THEN 'acceptable'
        ELSE 'violated'
    END as sla_status
FROM video_search_sla_metrics
ORDER BY metric_date DESC;

-- Comments
COMMENT ON TABLE video_search_metrics_hourly IS 'Hourly aggregated metrics for video search performance';
COMMENT ON TABLE video_search_query_analytics IS 'Analytics for search query patterns and performance';
COMMENT ON TABLE video_search_error_logs IS 'Error logs for troubleshooting and monitoring';
COMMENT ON TABLE video_search_sla_metrics IS 'SLA metrics for service level monitoring';
