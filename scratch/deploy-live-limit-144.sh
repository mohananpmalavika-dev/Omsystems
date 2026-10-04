set -eu
cd /opt/sentinel-grid
test "$(git rev-parse --short=8 HEAD)" = 'b0644bfa'
test -z "$(git diff --name-only)"
patch_dir=/tmp/sentinel-live-limit-144-20261004
mkdir -p "$patch_dir"
tar -tzf /tmp/live-limit-144-update.tar.gz > "$patch_dir/files.txt"
test "$(wc -l < "$patch_dir/files.txt")" -eq 6
tar -czf "$patch_dir/source-before.tar.gz" -T "$patch_dir/files.txt"
sudo tar -xzf /tmp/live-limit-144-update.tar.gz -C /opt/sentinel-grid
sudo docker image tag "$(sudo docker inspect sentinel-gcp-control-plane --format '{{.Image}}')" sentinel-gcp-control-plane:before-live-limit-144-20261004
sudo docker image tag "$(sudo docker inspect sentinel-gcp-dashboard --format '{{.Image}}')" sentinel-gcp-dashboard:before-live-limit-144-20261004
sudo docker cp sentinel-gcp-control-plane:/app/dist/src/branch-protection/routes.js "$patch_dir/routes.js"
sudo python3 - "$patch_dir/routes.js" <<'PY'
import pathlib,sys
path=pathlib.Path(sys.argv[1]);source=path.read_text()
old="maxConcurrentStreams: z.number().int().min(1).max(16)"
assert source.count(old)==1,'Unexpected production policy schema'
path.write_text(source.replace(old,old.replace('max(16)','max(144)')))
PY
printf '%s\n' 'FROM sentinel-gcp-control-plane:before-live-limit-144-20261004' 'COPY routes.js /app/dist/src/branch-protection/routes.js' > "$patch_dir/Dockerfile"
sudo docker build -t sentinel-gcp-control-plane:latest "$patch_dir"
sudo docker run --rm --entrypoint node sentinel-gcp-control-plane:latest --check /app/dist/src/branch-protection/routes.js
cd /opt/sentinel-grid/deploy/gcp
sudo docker compose -f docker-compose.gcp.yml build dashboard
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps control-plane dashboard
sudo docker ps --format '{{.Names}} {{.Status}}'
