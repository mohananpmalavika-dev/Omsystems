import hashlib
import json
import pathlib
rows=json.loads(pathlib.Path('reports/helmet-batch-false-alarms-2026-10-05-study.json').read_text())[:20]
hashes={hashlib.md5(pathlib.Path(row['file']).read_bytes()).hexdigest():row['file'] for row in rows}
sql="""set -e
sudo docker exec -i sentinel-gcp-postgres psql -Aqt -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT e.id,e.occurred_at,md5(decode(e.metadata->>'annotatedSnapshotBase64','base64')) AS hash FROM analytics_events e WHERE e.detection_type='helmet-worn' AND e.occurred_at BETWEEN '2026-10-05 00:00:00+00' AND '2026-10-06 00:00:00+00' AND md5(decode(e.metadata->>'annotatedSnapshotBase64','base64')) IN (HASHES);
SQL
""".replace('HASHES',','.join("'"+h+"'" for h in hashes))
pathlib.Path('scratch/match-helmet-batch-snapshots-2026-10-05.sh').write_text(sql,newline='\n')
pathlib.Path('tmp/helmet-batch-supplied-hashes.json').write_text(json.dumps(hashes,indent=2))
