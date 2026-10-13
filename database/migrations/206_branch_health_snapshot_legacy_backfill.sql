-- Preserve visibility of branch summaries written before explicit typing.
UPDATE device_health_snapshots
SET device_type = 'branch',
    device_id = COALESCE(device_id, 'branch:' || branch_id::text),
    branch_node_id = COALESCE(branch_node_id, branch_id),
    health_score = COALESCE(health_score, ROUND(camera_health_score)::integer),
    metrics = COALESCE(metrics, '{}'::jsonb)
WHERE branch_id IS NOT NULL AND device_type IS NULL;
