import hashlib
import pathlib
hashes=[hashlib.md5(pathlib.Path(f'C:/Users/Dhanya/Downloads/incident-snapshot-{id}.jpg').read_bytes()).hexdigest() for id in ['1791204590121','1791204562457','1791204377566']]
sql='''set -e
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT e.id,e.camera_id,e.occurred_at,e.model_version,e.confidence,md5(decode(e.metadata->>'annotatedSnapshotBase64','base64')) AS hash,a.id AS alert_id,a.status,
 (SELECT json_agg(json_build_object('label',o.label,'confidence',o.confidence,'box',o.bounding_box)) FROM detected_objects o WHERE o.event_id=e.id) AS objects
FROM analytics_events e LEFT JOIN analytics_alerts a ON a.event_id=e.id
WHERE e.detection_type='helmet-worn' AND e.occurred_at BETWEEN '2026-10-05 12:35:00+00' AND '2026-10-05 13:05:00+00' AND md5(decode(e.metadata->>'annotatedSnapshotBase64','base64')) IN (HASHES) ORDER BY e.occurred_at;
SQL
sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from "node:fs";console.log(fs.readFileSync("/app/dist/analytics-engine/src/detectors/helmet-detector.js","utf8").match(/super\\("helmet",[^;]+/g));const h=await(await fetch("http://localhost:8092/health")).json();console.log(JSON.stringify({state:h.aiState,helmet:h.pipeline?.detectors?.helmet,fastAlert:process.env.HELMET_FAST_ALERT}));'
'''.replace('HASHES',','.join("'"+h+"'" for h in hashes))
pathlib.Path('scratch/inspect-helmet-latest-2026-10-05.sh').write_text(sql,newline='\n')
print(hashes)
