set -e
grep -n 'super("helmet"' /opt/sentinel-grid/analytics-engine/src/detectors/helmet-detector.ts
sudo docker exec -i sentinel-gcp-dashboard node <<'JS'
const fs=require('fs'),path=require('path');
let matches=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.statSync(file).isDirectory())walk(file);else if(file.endsWith('.js')&&fs.readFileSync(file,'utf8').includes('document.fullscreenElement??document.body'))matches.push(file);}}
walk('/app/dashboard/.next/static');
console.log(JSON.stringify({fullscreenAlertPortalBundled:matches.length>0,matchingChunks:matches.length}));
if(!matches.length)process.exit(1);
JS
curl --silent --output /dev/null --write-out 'login_http=%{http_code}\n' http://127.0.0.1:10000/login
