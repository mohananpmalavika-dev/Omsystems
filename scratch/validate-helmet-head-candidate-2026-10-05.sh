set -Eeuo pipefail
umask 077
target=sentinel-gcp-analytics-engine
stage=/tmp/sentinel-helmet-head-1.2.0-20261005
source_root=/opt/sentinel-grid
candidate=sentinel-gcp-analytics-engine:helmet-head-1.2.0-20261005
mkdir -p "$stage"
test ! -e "$stage/deployed.txt"
tar xzf /tmp/helmet-head-code-1.2.0-20261005.tar.gz -C "$stage"
trap 'grep -E "^(FAILED|SUMMARY|SCORES)|Error:" "$stage/supplied-validation.log" "$stage/original-validation.log" 2>/dev/null || true' ERR
sudo docker cp "$target":/app/dist/analytics-engine/src/detectors/helmet-detector.js "$stage/helmet-detector.before.js"
grep -q 'super("helmet", "1.1.9")' "$stage/helmet-detector.before.js"
grep -q 'super("helmet", "1.2.0")' "$stage/runtime/detectors/helmet-detector.js"
printf '%s  %s\n' 8afe10f62194df0980aa50d8017588b2936e786b7a467b59d3df572b18f43f32 "$stage/helmet-head-localizer.onnx" | sha256sum -c -
old_image=$(sudo docker inspect "$target" --format '{{.Image}}')
image_tag=$(sudo docker inspect "$target" --format '{{.Config.Image}}')
test "${image_tag#sha256:}" = "$image_tag"
backup_tag=sentinel-gcp-analytics-engine:before-helmet-head-1.2.0-20261005
sudo docker tag "$old_image" "$backup_tag"
printf '%s\n' "$old_image" "$image_tag" > "$stage/image-before.txt"
cp -a "$source_root/analytics-engine/src" "$stage/source-before"
cp "$source_root/analytics-engine/models/manifest.json" "$stage/manifest.before.json"
# Hard-link existing model artifacts into an isolated directory, replacing
# only the manifest link so validation cannot modify production model files.
test ! -e "$stage/models"
cp -al "$source_root/analytics-engine/models" "$stage/models"
cp --remove-destination "$stage/manifest.json" "$stage/models/manifest.json"
cp --remove-destination "$stage/helmet-head-localizer.onnx" "$stage/models/safety/helmet-head-localizer.onnx"
printf '%s\n' "FROM $backup_tag" 'COPY --chmod=0644 runtime/ /app/dist/analytics-engine/src/' > "$stage/Dockerfile"
sudo docker build -t "$candidate" "$stage"
sudo docker exec -i sentinel-gcp-postgres psql -Aqt -v ON_ERROR_STOP=1 -U sentinel_admin -d sentinel_grid <<'SQL' | sudo docker run --rm -i --user 0 --network none --entrypoint node -e DETECTOR_VERSION=1.2.0 -e MODELS_DIR=/app/models -v "$stage/models:/app/models:ro" -v "$stage:/validation:ro" "$candidate" /validation/validate.mjs --originals > "$stage/original-validation.log" 2>&1
WITH originals AS (
SELECT e.id,e.metadata->>'snapshotBase64' AS snapshot,(SELECT json_agg(json_build_object('label',o.label,'confidence',o.confidence,'boundingBox',o.bounding_box)) FROM detected_objects o WHERE o.event_id=e.id AND o.label='person') AS observations FROM analytics_events e
WHERE e.id IN (
'4e39d73f-c089-4791-ba0a-ba8ece18b2b4','fbdd11e7-734d-47d0-8715-dfe0d25fa380','4599426c-6cf4-4046-9fa6-59d09f077c23',
'3d62d89e-6cd2-465e-b46c-f42837b01231','34181b1e-58c9-451b-b258-d2d865cb0d56','0e556390-887c-472d-a0e4-b694e4cd1ea7','d8a4be2f-c231-433c-bdd8-d64736f9cfe5',
'b3d41e23-fe4b-449c-bdd3-d82a63ea9a5b','2889bea6-ca6e-4a0b-b8d3-9f9e5bc65c16','161b9dfe-2881-4506-9aa3-eff84736832a','c4864755-99b9-44d9-a030-5a86e8b96358',
'947e402f-d777-4140-ae53-73b215ea19c9','606e7e81-8b11-4f7c-ade2-48fd9beb9dd4','582e64e2-0aa8-4c86-9416-beb82646b80d','d598b89d-d624-41ea-8980-9c2f87460de7','6ba5c8ff-82e4-42c8-a55b-9237e90b24ec',
'bb60740e-2128-4f76-9fb9-feda0379c247','ec7ce7d0-e678-4684-99a6-77ed9d33b7e2','f7f6806b-6591-4de7-9253-9dcceb88dddb') AND e.metadata->>'snapshotBase64' IS NOT NULL
), samples AS (
SELECT json_build_object('id',id::text||':fresh','snapshot',snapshot) AS sample FROM originals
UNION ALL SELECT json_build_object('id',id::text||':recorded','snapshot',snapshot,'observations',observations) FROM originals
) SELECT json_agg(sample) FROM samples;
SQL
grep -E '^(VALIDATED|FAILED|SUMMARY|SCORES)' "$stage/original-validation.log"
test "$(grep -c '^VALIDATED ' "$stage/original-validation.log")" = 76
sudo docker image inspect "$candidate" --format '{{.Id}}' > "$stage/candidate-validated.txt"
date -u > "$stage/validated.txt"
trap - ERR
