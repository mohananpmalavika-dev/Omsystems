BEGIN READ ONLY;
SELECT now() AT TIME ZONE 'Asia/Kolkata' AS current_ist;
WITH branches AS (
 SELECT id,name FROM resource_nodes WHERE tenant_id='00000000-0000-4000-8000-000000000001'
 AND id IN ('d7b23dee-9814-48c9-8805-48b61b33e3a9','921d336d-baa9-4b25-9f9f-f6542bba94cc','d8467a57-dae8-4012-ba5e-c3254075aa61','6ddee070-9050-4f55-aaa1-1190654bbc6b')
)
SELECT b.name AS branch,count(c.id) AS cameras,
 count(c.id) FILTER (WHERE h.observed_at > now()-interval '10 minutes') AS recent_camera_health,
 max(h.observed_at) AT TIME ZONE 'Asia/Kolkata' AS latest_health_ist
FROM branches b JOIN cameras c ON c.branch_node_id=b.id
LEFT JOIN operational_health_latest h ON h.tenant_id='00000000-0000-4000-8000-000000000001' AND h.branch_id=b.id AND h.device_type='camera' AND h.device_id=c.id::text
GROUP BY b.name ORDER BY b.name;
SELECT n.name AS branch,h.quality,h.reason_codes,count(*) AS cameras,
 h.metrics->>'streamStatus' AS stream_status,h.metrics->>'analyticsStatus' AS analytics_status
FROM operational_health_latest h JOIN resource_nodes n ON n.id=h.branch_id
WHERE h.tenant_id='00000000-0000-4000-8000-000000000001' AND h.device_type='camera'
AND n.id IN ('d7b23dee-9814-48c9-8805-48b61b33e3a9','921d336d-baa9-4b25-9f9f-f6542bba94cc','d8467a57-dae8-4012-ba5e-c3254075aa61','6ddee070-9050-4f55-aaa1-1190654bbc6b')
GROUP BY n.name,h.quality,h.reason_codes,h.metrics->>'streamStatus',h.metrics->>'analyticsStatus' ORDER BY n.name;
SELECT n.name AS branch,e.detection_type,count(*) AS events,
 max(e.occurred_at) AT TIME ZONE 'Asia/Kolkata' AS latest_event_ist
FROM analytics_events e JOIN cameras c ON c.id=e.camera_id JOIN resource_nodes n ON n.id=c.branch_node_id
WHERE e.tenant_id='00000000-0000-4000-8000-000000000001' AND e.occurred_at>now()-interval '2 hours'
AND n.id IN ('d7b23dee-9814-48c9-8805-48b61b33e3a9','921d336d-baa9-4b25-9f9f-f6542bba94cc','d8467a57-dae8-4012-ba5e-c3254075aa61','6ddee070-9050-4f55-aaa1-1190654bbc6b')
GROUP BY n.name,e.detection_type ORDER BY n.name,e.detection_type;
COMMIT;
