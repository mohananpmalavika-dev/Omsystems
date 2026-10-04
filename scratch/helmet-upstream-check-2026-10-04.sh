set -e
sudo docker inspect sentinel-gcp-analytics-engine --format '{{.State.StartedAt}} restarts={{.RestartCount}}'
sudo docker logs --since 15m sentinel-gcp-control-plane 2>&1 | python3 -c 'import json,sys; records=[]
for line in sys.stdin:
 try:
  r=json.loads(line)
  if "Analytics" in r.get("msg",""): records.append({k:r.get(k) for k in ("time","msg","cameraId","upstreamStatus","failed","error")})
 except ValueError: pass
for r in records[-16:]: print(json.dumps(r))'
sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
(async()=>{const base=process.env.ANALYTICS_ENGINE_URL;console.log(JSON.stringify({analyticsConfigured:!!base}));if(base){const response=await fetch(new URL('/health',base),{signal:AbortSignal.timeout(10000)});const h=await response.json();console.log(JSON.stringify({httpStatus:response.status,state:h.aiState,received:h.received,failed:h.failed,scheduler:h.pipeline?.scheduler}));}})().catch(e=>{console.error(e.message);process.exit(1)});
JS
