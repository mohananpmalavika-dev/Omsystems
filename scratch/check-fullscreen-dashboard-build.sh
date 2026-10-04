set -e
stage=/tmp/sentinel-fullscreen-alert-dashboard-build-20261004
if test -f "$stage/build.log"; then tail -12 "$stage/build.log"; fi
if test -f "$stage/deployed.txt"; then cat "$stage/deployed.txt"; fi
sudo docker ps --format '{{.Names}} {{.Status}}' | grep -E 'dashboard|analytics-engine'
sudo docker inspect --format '{{.Image}}' sentinel-gcp-dashboard
curl --silent --output /dev/null --write-out 'login_http=%{http_code}\n' http://127.0.0.1:10000/login
