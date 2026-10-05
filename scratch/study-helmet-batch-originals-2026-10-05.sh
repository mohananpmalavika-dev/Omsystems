set -Eeuo pipefail
stage=/tmp/sentinel-helmet-batch-1.1.8-20261005
candidate=sentinel-gcp-analytics-engine:helmet-batch-1.1.8-20261005
cp /tmp/validate-helmet-batch-2026-10-05.mjs "$stage/study.mjs"
sudo docker exec -i sentinel-gcp-postgres psql -Aqt -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL' | sudo docker run --rm -i --user 0 --network none --entrypoint node -e MODELS_DIR=/app/models -v /opt/sentinel-grid/analytics-engine/models:/app/models:ro -v "$stage:/validation:ro" "$candidate" /validation/study.mjs --originals --study > "$stage/original-crop-study.log" 2>&1
SELECT json_agg(json_build_object('id',e.id,'snapshot',e.metadata->>'snapshotBase64')) FROM analytics_events e
WHERE e.id IN ('b3d41e23-fe4b-449c-bdd3-d82a63ea9a5b','d598b89d-d624-41ea-8980-9c2f87460de7','582e64e2-0aa8-4c86-9416-beb82646b80d');
SQL
grep '^STUDY' "$stage/original-crop-study.log"
# Same crop study on the three supplied known-wearer controls.
sudo docker run --rm --user 0 --network none --entrypoint node -e MODELS_DIR=/app/models -v /opt/sentinel-grid/analytics-engine/models:/app/models:ro -v "$stage:/validation:ro" "$candidate" /validation/study.mjs --study > "$stage/supplied-crop-study.log" 2>&1
grep '^STUDY' "$stage/supplied-crop-study.log" | grep -E 'sample-2[123].jpg'
