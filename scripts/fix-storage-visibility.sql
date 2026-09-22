-- ============================================================================
-- Storage Visibility Diagnostic and Fix Script
-- ============================================================================
-- Purpose: Diagnose and resolve storage telemetry visibility issues
-- Usage: psql -f scripts/fix-storage-visibility.sql
-- ============================================================================

\echo '=== Storage Visibility Diagnostic Report ==='
\echo ''

-- 1. Check if operational_telemetry table exists and has storage data
\echo '1. Checking operational_telemetry table for storage records...'
SELECT 
  COUNT(*) as total_storage_records,
  COUNT(DISTINCT tenant_id) as tenants_with_storage,
  COUNT(DISTINCT branch_id) as branches_with_storage,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  (MAX(created_at) < NOW() - INTERVAL '24 hours') as data_is_stale
FROM operational_telemetry
WHERE device_type = 'disk';

\echo ''
\echo '2. Storage records per branch (last 24 hours)...'
SELECT 
  branch_id,
  COUNT(*) as record_count,
  MAX(created_at) as last_reported,
  COUNT(DISTINCT device_id) as unique_disks,
  AGE(NOW(), MAX(created_at)) as time_since_last
FROM operational_telemetry
WHERE device_type = 'disk'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY branch_id
ORDER BY last_reported DESC;

\echo ''
\echo '3. Sample storage metrics structure...'
SELECT 
  device_id,
  device_type,
  branch_id,
  jsonb_object_keys(metrics) as metric_keys,
  observed_at
FROM operational_telemetry
WHERE device_type = 'disk'
ORDER BY created_at DESC
LIMIT 5;

\echo ''
\echo '4. Checking for required metric fields...'
SELECT 
  device_id,
  branch_id,
  CASE 
    WHEN metrics ? 'totalBytes' OR metrics ? 'capacityBytes' OR metrics ? 'capacityGB' THEN '✓'
    ELSE '✗'
  END as has_capacity,
  CASE 
    WHEN metrics ? 'usedBytes' OR metrics ? 'usedGB' THEN '✓'
    ELSE '✗'
  END as has_used,
  CASE 
    WHEN metrics ? 'freeBytes' OR metrics ? 'availableBytes' THEN '✓'
    ELSE '✗'
  END as has_free,
  CASE 
    WHEN metrics ? 'dailyWriteRateBytes' OR metrics ? 'growthRatePerDay' OR metrics ? 'dailyIngestGb' THEN '✓'
    ELSE '✗'
  END as has_growth_rate,
  created_at
FROM operational_telemetry
WHERE device_type = 'disk'
ORDER BY created_at DESC
LIMIT 10;

\echo ''
\echo '5. Checking user permissions for storage viewing...'
SELECT 
  u.id as user_id,
  u.username,
  u.tenant_id,
  COUNT(DISTINCT ot.branch_id) as accessible_branches_with_storage,
  MAX(ot.created_at) as latest_storage_data
FROM users u
LEFT JOIN operational_telemetry ot ON ot.tenant_id = u.tenant_id AND ot.device_type = 'disk'
WHERE u.is_active = true
GROUP BY u.id, u.username, u.tenant_id
HAVING COUNT(DISTINCT ot.branch_id) > 0
ORDER BY latest_storage_data DESC;

\echo ''
\echo '6. Identifying branches without storage data...'
SELECT 
  rn.id as branch_id,
  rn.name as branch_name,
  rn.tenant_id,
  COUNT(DISTINCT ot.device_id) as storage_devices
FROM resource_nodes rn
LEFT JOIN operational_telemetry ot ON ot.branch_id = rn.id AND ot.device_type = 'disk' AND ot.created_at > NOW() - INTERVAL '7 days'
WHERE rn.node_type = 'branch'
  AND rn.is_active = true
GROUP BY rn.id, rn.name, rn.tenant_id
HAVING COUNT(DISTINCT ot.device_id) = 0
ORDER BY rn.name;

\echo ''
\echo '7. Checking edge agent registration status...'
SELECT 
  ea.id as agent_id,
  ea.name as agent_name,
  ea.branch_id,
  rn.name as branch_name,
  ea.status,
  ea.last_heartbeat_at,
  AGE(NOW(), ea.last_heartbeat_at) as heartbeat_age,
  COUNT(DISTINCT ot.device_id) FILTER (WHERE ot.device_type = 'disk') as storage_reports
FROM edge_agents ea
JOIN resource_nodes rn ON rn.id = ea.branch_id
LEFT JOIN operational_telemetry ot ON ot.edge_agent_id = ea.id 
  AND ot.device_type = 'disk' 
  AND ot.created_at > NOW() - INTERVAL '24 hours'
WHERE ea.is_active = true
GROUP BY ea.id, ea.name, ea.branch_id, rn.name, ea.status, ea.last_heartbeat_at
ORDER BY storage_reports DESC, ea.last_heartbeat_at DESC;

\echo ''
\echo '8. Sample complete storage record...'
SELECT 
  jsonb_pretty(jsonb_build_object(
    'id', id,
    'tenant_id', tenant_id,
    'branch_id', branch_id,
    'device_type', device_type,
    'device_id', device_id,
    'metrics', metrics,
    'quality', quality,
    'observed_at', observed_at,
    'created_at', created_at
  )) as sample_storage_record
FROM operational_telemetry
WHERE device_type = 'disk'
ORDER BY created_at DESC
LIMIT 1;

\echo ''
\echo '=== Diagnostic Summary ==='
\echo ''

-- Generate summary report
DO $$
DECLARE
  total_records INTEGER;
  stale_data BOOLEAN;
  branches_without_data INTEGER;
  offline_agents INTEGER;
BEGIN
  -- Count total storage records
  SELECT COUNT(*) INTO total_records 
  FROM operational_telemetry 
  WHERE device_type = 'disk' AND created_at > NOW() - INTERVAL '7 days';
  
  -- Check if data is stale
  SELECT COALESCE(MAX(created_at) < NOW() - INTERVAL '24 hours', true) INTO stale_data
  FROM operational_telemetry 
  WHERE device_type = 'disk';
  
  -- Count branches without storage data
  SELECT COUNT(*) INTO branches_without_data
  FROM resource_nodes rn
  LEFT JOIN operational_telemetry ot ON ot.branch_id = rn.id AND ot.device_type = 'disk' AND ot.created_at > NOW() - INTERVAL '7 days'
  WHERE rn.node_type = 'branch' AND rn.is_active = true
  GROUP BY rn.id
  HAVING COUNT(ot.id) = 0;
  
  -- Count offline edge agents
  SELECT COUNT(*) INTO offline_agents
  FROM edge_agents
  WHERE is_active = true
    AND (status != 'online' OR last_heartbeat_at < NOW() - INTERVAL '1 hour');
  
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE 'STORAGE VISIBILITY DIAGNOSTIC SUMMARY';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';
  RAISE NOTICE 'Total storage records (last 7 days): %', total_records;
  RAISE NOTICE 'Data is stale (>24h old): %', stale_data;
  RAISE NOTICE 'Branches without storage data: %', COALESCE(branches_without_data, 0);
  RAISE NOTICE 'Offline edge agents: %', offline_agents;
  RAISE NOTICE '';
  
  IF total_records = 0 THEN
    RAISE NOTICE '❌ CRITICAL: No storage telemetry data found!';
    RAISE NOTICE '   Action Required:';
    RAISE NOTICE '   1. Verify edge agents are running and configured';
    RAISE NOTICE '   2. Check NVR storage monitoring is enabled';
    RAISE NOTICE '   3. Manually ingest test data to verify pipeline';
  ELSIF stale_data THEN
    RAISE NOTICE '⚠️  WARNING: Storage data is stale (older than 24 hours)';
    RAISE NOTICE '   Action Required:';
    RAISE NOTICE '   1. Check edge agent connectivity';
    RAISE NOTICE '   2. Verify storage monitoring services are running';
    RAISE NOTICE '   3. Review error logs for telemetry ingestion failures';
  ELSIF COALESCE(branches_without_data, 0) > 0 THEN
    RAISE NOTICE '⚠️  WARNING: Some branches have no storage data';
    RAISE NOTICE '   Action Required:';
    RAISE NOTICE '   1. Review branch-specific configurations';
    RAISE NOTICE '   2. Verify edge agents assigned to those branches';
    RAISE NOTICE '   3. Check if storage monitoring is disabled for those branches';
  ELSE
    RAISE NOTICE '✅ SUCCESS: Storage telemetry is being collected properly';
    RAISE NOTICE '   Next Steps:';
    RAISE NOTICE '   1. Verify frontend displays storage data correctly';
    RAISE NOTICE '   2. Test predictive dashboard endpoint';
    RAISE NOTICE '   3. Confirm user permissions allow storage viewing';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

\echo ''
\echo '=== Recommended Actions ==='
\echo ''
\echo 'Based on the diagnostic results, consider these actions:'
\echo ''
\echo '1. If no storage data exists:'
\echo '   - Run: npm run seed:storage-telemetry (if available)'
\echo '   - Or manually POST to /v1/operational-health/storage'
\echo ''
\echo '2. If data is stale:'
\echo '   - Check edge agent logs: journalctl -u edge-agent -f'
\echo '   - Restart edge agents: systemctl restart edge-agent'
\echo ''
\echo '3. If frontend still shows empty:'
\echo '   - Clear cache: redis-cli FLUSHDB'
\echo '   - Test API: curl /api/control/v1/maintenance/predictive/dashboard'
\echo '   - Check browser console for errors'
\echo ''
\echo '=== End of Diagnostic Report ==='
