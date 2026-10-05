set -Eeuo pipefail
stage=/tmp/sentinel-helmet-batch-1.1.8-20261005
source_root=/opt/sentinel-grid
candidate=sentinel-gcp-analytics-engine:helmet-batch-1.1.8-20261005
test "$(grep -c '^VALIDATED ' "$stage/supplied-validation.log")" = 62
test "$(sha256sum "$stage/helmet-detector.js" | cut -d ' ' -f 1)" = 05dcd0c6a20271dac47821283a561a578306b51f6c96594d4d3fced4bc4e1a19
trap 'grep -E "^(FAILED|SUMMARY|SCORES)|Error:" "$stage/original-validation.log" 2>/dev/null || true' ERR
# Original snapshots stay on the server: database -> pipe -> isolated process.
# Only IDs, numeric scores and counts appear in diagnostic logs/output.
sudo docker exec -i sentinel-gcp-postgres psql -Aqt -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL' | sudo docker run --rm -i --user 0 --network none --entrypoint node -e MODELS_DIR=/app/models -v "$source_root/analytics-engine/models:/app/models:ro" -v "$stage:/validation:ro" "$candidate" /validation/validate.mjs --originals > "$stage/original-validation.log" 2>&1
SELECT json_agg(json_build_object('id',e.id,'snapshot',e.metadata->>'snapshotBase64')) FROM analytics_events e
WHERE e.id IN (
'4e39d73f-c089-4791-ba0a-ba8ece18b2b4',
'fbdd11e7-734d-47d0-8715-dfe0d25fa380','4599426c-6cf4-4046-9fa6-59d09f077c23',
'3d62d89e-6cd2-465e-b46c-f42837b01231','34181b1e-58c9-451b-b258-d2d865cb0d56',
'0e556390-887c-472d-a0e4-b694e4cd1ea7','d8a4be2f-c231-433c-bdd8-d64736f9cfe5',
'b3d41e23-fe4b-449c-bdd3-d82a63ea9a5b','2889bea6-ca6e-4a0b-b8d3-9f9e5bc65c16',
'161b9dfe-2881-4506-9aa3-eff84736832a','c4864755-99b9-44d9-a030-5a86e8b96358',
'947e402f-d777-4140-ae53-73b215ea19c9','606e7e81-8b11-4f7c-ade2-48fd9beb9dd4',
'582e64e2-0aa8-4c86-9416-beb82646b80d','d598b89d-d624-41ea-8980-9c2f87460de7',
'6ba5c8ff-82e4-42c8-a55b-9237e90b24ec') AND e.metadata->>'snapshotBase64' IS NOT NULL;
SQL
grep -E '^(VALIDATED|FAILED|SUMMARY|SCORES)' "$stage/original-validation.log"
test "$(grep -c '^VALIDATED ' "$stage/original-validation.log")" = 32
date -u > "$stage/validated.txt"
sudo docker image inspect "$candidate" --format '{{.Id}}' > "$stage/candidate-validated.txt"
trap - ERR
