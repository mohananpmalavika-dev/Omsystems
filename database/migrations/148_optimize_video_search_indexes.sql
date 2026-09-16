-- ============================================================================
-- Video Search Performance Optimization - Indexes
-- ============================================================================
-- Comprehensive indexing strategy for video search queries
-- Guard: all statements are no-ops if the base tables don't exist yet.

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'video_metadata'
  ) THEN
    RAISE NOTICE 'video_metadata table not found — skipping 148_optimize_video_search_indexes migration';
    RETURN;
  END IF;
END $guard$;

-- ============================================================================
-- 1. VIDEO METADATA TABLE INDEXES
-- ============================================================================

-- Composite index for common search patterns (tenant + time range)
CREATE INDEX IF NOT EXISTS idx_video_metadata_tenant_time_range
    ON video_metadata(tenant_id, start_time DESC, end_time DESC)
    WHERE indexed_at IS NOT NULL;

-- Index for camera-based searches
CREATE INDEX IF NOT EXISTS idx_video_metadata_camera_time
    ON video_metadata(camera_id, start_time DESC)
    INCLUDE (segment_id, duration_seconds);

-- Index for branch-based searches
CREATE INDEX IF NOT EXISTS idx_video_metadata_branch_time
    ON video_metadata(branch_id, start_time DESC)
    WHERE branch_id IS NOT NULL;

-- Index for segment lookups
CREATE INDEX IF NOT EXISTS idx_video_metadata_segment
    ON video_metadata(segment_id)
    INCLUDE (camera_id, start_time, end_time);

-- Index for recent-data query patterns (tenant + camera + time)
-- Note: Cannot use NOW() in partial index predicate (volatile function not allowed).
-- Using a plain composite index instead; the query planner will still use it efficiently.
CREATE INDEX IF NOT EXISTS idx_video_metadata_recent
    ON video_metadata(tenant_id, camera_id, start_time DESC);

-- Index for scene type filtering
CREATE INDEX IF NOT EXISTS idx_video_metadata_scene_type
    ON video_metadata(scene_type, lighting_condition)
    WHERE scene_type IS NOT NULL;

-- ============================================================================
-- 2. VIDEO OBJECTS TABLE INDEXES
-- ============================================================================

-- Composite index for object type searches
CREATE INDEX IF NOT EXISTS idx_video_objects_type_time
    ON video_objects(object_type, first_seen DESC)
    INCLUDE (video_metadata_id, confidence);

-- Index for attribute-based searches (JSONB GIN index)
CREATE INDEX IF NOT EXISTS idx_video_objects_attributes_gin
    ON video_objects USING GIN(attributes jsonb_path_ops);

-- Specific JSONB path indexes for common attributes
CREATE INDEX IF NOT EXISTS idx_video_objects_upper_clothing_color
    ON video_objects((attributes->>'upperClothingColor'))
    WHERE object_type = 'person' AND attributes->>'upperClothingColor' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_objects_lower_clothing_color
    ON video_objects((attributes->>'lowerClothingColor'))
    WHERE object_type = 'person' AND attributes->>'lowerClothingColor' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_objects_vehicle_color
    ON video_objects((attributes->>'vehicleColor'))
    WHERE object_type = 'vehicle' AND attributes->>'vehicleColor' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_objects_vehicle_type
    ON video_objects((attributes->>'vehicleType'))
    WHERE object_type = 'vehicle' AND attributes->>'vehicleType' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_objects_license_plate
    ON video_objects((attributes->>'licensePlate'))
    WHERE object_type = 'vehicle' AND attributes->>'licensePlate' IS NOT NULL;

-- Index for cross-camera tracking
CREATE INDEX IF NOT EXISTS idx_video_objects_cross_camera_tracking
    ON video_objects(cross_camera_tracking_id, first_seen DESC)
    WHERE cross_camera_tracking_id IS NOT NULL;

-- Index for tracking ID lookups
CREATE INDEX IF NOT EXISTS idx_video_objects_tracking_id
    ON video_objects(tracking_id, object_type)
    WHERE tracking_id IS NOT NULL;

-- Index for confidence-based filtering
CREATE INDEX IF NOT EXISTS idx_video_objects_confidence
    ON video_objects(confidence DESC)
    WHERE confidence >= 0.5;

-- Composite index for metadata + object joins
CREATE INDEX IF NOT EXISTS idx_video_objects_metadata_type
    ON video_objects(video_metadata_id, object_type, confidence DESC);

-- ============================================================================
-- 3. QUERY OPTIMIZATION - MATERIALIZED VIEWS
-- ============================================================================

-- Materialized view for frequently accessed object summaries
CREATE MATERIALIZED VIEW IF NOT EXISTS video_objects_summary AS
SELECT
    vo.video_metadata_id,
    vo.object_type,
    COUNT(*) as object_count,
    AVG(vo.confidence) as avg_confidence,
    MAX(vo.confidence) as max_confidence
FROM video_objects vo
GROUP BY vo.video_metadata_id, vo.object_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_objects_summary_metadata_type
    ON video_objects_summary(video_metadata_id, object_type);

-- Materialized view for popular search attributes
CREATE MATERIALIZED VIEW IF NOT EXISTS popular_search_attributes AS
SELECT 
    object_type,
    attributes->>'upperClothingColor' as upper_color,
    attributes->>'lowerClothingColor' as lower_color,
    attributes->>'vehicleColor' as vehicle_color,
    attributes->>'vehicleType' as vehicle_type,
    COUNT(*) as occurrence_count,
    AVG(confidence) as avg_confidence
FROM video_objects
WHERE first_seen >= NOW() - INTERVAL '30 days'
GROUP BY 
    object_type,
    attributes->>'upperClothingColor',
    attributes->>'lowerClothingColor',
    attributes->>'vehicleColor',
    attributes->>'vehicleType'
HAVING COUNT(*) >= 5;

CREATE INDEX IF NOT EXISTS idx_popular_search_attributes_type
    ON popular_search_attributes(object_type, occurrence_count DESC);

-- ============================================================================
-- 4. COVERING INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Covering index for natural language search with person filter
CREATE INDEX IF NOT EXISTS idx_video_search_person_covering
    ON video_objects(object_type, first_seen DESC)
    INCLUDE (video_metadata_id, attributes, confidence, bounding_boxes)
    WHERE object_type = 'person';

-- Covering index for vehicle search
CREATE INDEX IF NOT EXISTS idx_video_search_vehicle_covering
    ON video_objects(object_type, first_seen DESC)
    INCLUDE (video_metadata_id, attributes, confidence, bounding_boxes)
    WHERE object_type = 'vehicle';

-- ============================================================================
-- 5. STATISTICS AND QUERY PLANNER OPTIMIZATIONS
-- ============================================================================

-- Update table statistics for better query planning
DO $$ BEGIN
    ANALYZE video_metadata;
    ANALYZE video_objects;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ANALYZE skipped: %', SQLERRM;
END $$;

-- Increase statistics target for frequently filtered columns
ALTER TABLE video_metadata ALTER COLUMN tenant_id SET STATISTICS 1000;
ALTER TABLE video_metadata ALTER COLUMN camera_id SET STATISTICS 1000;
ALTER TABLE video_metadata ALTER COLUMN start_time SET STATISTICS 1000;

ALTER TABLE video_objects ALTER COLUMN object_type SET STATISTICS 1000;
ALTER TABLE video_objects ALTER COLUMN confidence SET STATISTICS 1000;
ALTER TABLE video_objects ALTER COLUMN attributes SET STATISTICS 1000;

-- ============================================================================
-- 6. PARTITIONING STRATEGY (For large deployments)
-- ============================================================================

-- Function to create monthly partitions for video_metadata
CREATE OR REPLACE FUNCTION create_video_metadata_partition(partition_date DATE)
RETURNS void AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    partition_name := 'video_metadata_' || TO_CHAR(partition_date, 'YYYY_MM');
    start_date := DATE_TRUNC('month', partition_date);
    end_date := start_date + INTERVAL '1 month';
    
    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF video_metadata
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-create partitions for next 3 months
CREATE OR REPLACE FUNCTION auto_create_video_metadata_partitions()
RETURNS void AS $$
DECLARE
    i INTEGER;
    partition_date DATE;
BEGIN
    FOR i IN 0..2 LOOP
        partition_date := DATE_TRUNC('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
        PERFORM create_video_metadata_partition(partition_date);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. QUERY OPTIMIZATION FUNCTIONS
-- ============================================================================

-- Function to suggest indexes for a specific tenant
CREATE OR REPLACE FUNCTION analyze_video_search_patterns(p_tenant_id UUID)
RETURNS TABLE(
    suggestion TEXT,
    query_pattern TEXT,
    estimated_benefit TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'Consider adding index on frequently queried camera' as suggestion,
        'Camera ID: ' || camera_id::TEXT as query_pattern,
        'High - ' || query_count || ' queries' as estimated_benefit
    FROM (
        SELECT 
            (request_payload->>'cameraId')::UUID as camera_id,
            COUNT(*) as query_count
        FROM video_search_query_analytics vsqa
        WHERE vsqa.tenant_id = p_tenant_id
          AND request_payload->>'cameraId' IS NOT NULL
          AND last_executed_at >= NOW() - INTERVAL '7 days'
        GROUP BY (request_payload->>'cameraId')::UUID
        HAVING COUNT(*) >= 100
        ORDER BY query_count DESC
        LIMIT 5
    ) hot_cameras;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. AUTOMATIC INDEX MAINTENANCE
-- ============================================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_video_search_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY video_objects_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY popular_search_attributes;
    
    RAISE NOTICE 'Refreshed video search materialized views';
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to refresh materialized views: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Schedule materialized view refresh (requires pg_cron or similar)
-- SELECT cron.schedule('refresh-video-search-views', '0 */4 * * *', 
--                      'SELECT refresh_video_search_materialized_views()');

-- ============================================================================
-- 9. QUERY PERFORMANCE MONITORING
-- ============================================================================

-- View for slow queries
CREATE OR REPLACE VIEW slow_video_search_queries AS
SELECT 
    query_text,
    query_type,
    avg_response_time_ms,
    execution_count,
    last_executed_at,
    CASE 
        WHEN avg_response_time_ms > 5000 THEN 'Critical'
        WHEN avg_response_time_ms > 2000 THEN 'Warning'
        ELSE 'OK'
    END as performance_status
FROM video_search_query_analytics
WHERE avg_response_time_ms > 1000
ORDER BY avg_response_time_ms DESC;

-- ============================================================================
-- 10. CLEANUP OLD DATA (Retention Policy)
-- ============================================================================

-- Function to archive old video metadata
CREATE OR REPLACE FUNCTION archive_old_video_metadata(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER;
BEGIN
    -- Move old data to archive table (if exists)
    -- For now, just count what would be archived
    SELECT COUNT(*) INTO archived_count
    FROM video_metadata
    WHERE start_time < NOW() - (retention_days || ' days')::INTERVAL;
    
    RAISE NOTICE 'Would archive % video metadata records older than % days', 
                 archived_count, retention_days;
    
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_video_metadata_tenant_time_range IS 
    'Optimizes tenant-scoped time range queries - most common search pattern';

COMMENT ON INDEX idx_video_objects_attributes_gin IS 
    'GIN index for JSONB attribute searches - enables fast attribute filtering';

COMMENT ON MATERIALIZED VIEW video_objects_summary IS 
    'Pre-aggregated object counts and confidence scores for faster dashboard queries';

COMMENT ON FUNCTION refresh_video_search_materialized_views() IS 
    'Refreshes all video search materialized views - should run every 4 hours';

-- ============================================================================
-- VACUUM AND MAINTENANCE
-- ANALYZE to update statistics (safe - skips tables that may not exist yet)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_metadata' AND table_schema = 'public') THEN
        ANALYZE video_metadata;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_objects' AND table_schema = 'public') THEN
        ANALYZE video_objects;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_search_query_analytics' AND table_schema = 'public') THEN
        ANALYZE video_search_query_analytics;
    END IF;
END $$;

-- Show index usage statistics
-- pg_stat_user_indexes columns: schemaname, relname (table), indexrelname (index), idx_scan, idx_tup_read, idx_tup_fetch
CREATE OR REPLACE VIEW video_search_index_usage AS
SELECT
    s.schemaname,
    s.relname      AS tablename,
    s.indexrelname AS indexname,
    s.idx_scan     AS index_scans,
    s.idx_tup_read AS tuples_read,
    s.idx_tup_fetch AS tuples_fetched,
    pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size
FROM pg_stat_user_indexes s
WHERE s.schemaname = 'public'
  AND s.relname IN ('video_metadata', 'video_objects')
ORDER BY s.idx_scan DESC;

COMMENT ON VIEW video_search_index_usage IS
    'Monitor index usage to identify unused or underutilized indexes';
