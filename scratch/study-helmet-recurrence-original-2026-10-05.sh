set -Eeuo pipefail
stage=/tmp/sentinel-helmet-recurrence-1.1.9-20261005
mkdir -p "$stage"
cp /tmp/validate-helmet-batch-2026-10-05.mjs "$stage/study.mjs"
sudo docker exec -i sentinel-gcp-postgres psql -Aqt -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL' | sudo docker run --rm -i --user 0 --network none --entrypoint node -e MODELS_DIR=/app/models -v /opt/sentinel-grid/analytics-engine/models:/app/models:ro -v "$stage:/validation:ro" sentinel-gcp-analytics-engine:helmet-batch-1.1.8-20261005 /validation/study.mjs --originals --study > "$stage/crop-study.log" 2>&1
SELECT json_agg(json_build_object('id',e.id,'snapshot',e.metadata->>'snapshotBase64','observations',(SELECT json_agg(json_build_object('label',o.label,'confidence',o.confidence,'boundingBox',o.bounding_box)) FROM detected_objects o WHERE o.event_id=e.id AND o.label='person'))) FROM analytics_events e WHERE e.id='bb60740e-2128-4f76-9fb9-feda0379c247';
SQL
grep '^STUDY' "$stage/crop-study.log"
sudo docker exec -i sentinel-gcp-postgres psql -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT label,confidence,bounding_box FROM detected_objects WHERE event_id='bb60740e-2128-4f76-9fb9-feda0379c247';
SQL
