#!/usr/bin/env bash
set -euo pipefail
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -P pager=off <<'SQL'
SELECT payload->>'recorderId' AS recorder, status, error,
 result->>'hddCount' AS disks, result->'reasonCodes' AS reasons,
 result->'metrics'->>'status' AS device_status
FROM edge_commands WHERE command_type = 'probe-recorder' AND requested_at > now() - interval '20 minutes'
ORDER BY requested_at DESC;
SELECT n.name AS branch, count(*) AS cameras, count(c.recorder_id) AS recorder_mapped
FROM cameras c JOIN resource_nodes n ON n.id = c.branch_node_id GROUP BY n.name ORDER BY n.name;
SQL
cd /opt/sentinel-grid
git status --short -- dashboard/app/api/operations/storage/route.ts dashboard/app/operations/storage/page.tsx
sudo docker exec sentinel-gcp-control-plane node -e 'fetch("http://127.0.0.1:8080/health").then(r=>console.log("control health",r.status))'
sudo docker exec sentinel-gcp-dashboard node -e 'Promise.all(["/operations/storage","/api/operations/storage"].map(async p=>{const r=await fetch("http://127.0.0.1:10000"+p);console.log(p,r.status);if(p.includes("/api/"))console.log(await r.text())})).catch(e=>{console.error(e.message);process.exitCode=1})'
sudo docker exec sentinel-gcp-dashboard sh -c 'grep -rl "Storage telemetry unavailable" /app/dashboard/.next/server/app/api/operations/storage /app/.next/server/app/api/operations/storage | head -2'
