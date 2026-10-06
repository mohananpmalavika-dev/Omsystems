set -eu
sudo docker logs --since 5m sentinel-gcp-control-plane 2>&1 | python3 -c 'import sys,json,collections
ids={};counts=collections.Counter()
for line in sys.stdin:
 try: row=json.loads(line)
 except: continue
 url=row.get("req",{}).get("url","")
 if any(p in url for p in ("alerts/command-center","alerts/events","analytics/live-wall")):ids[row.get("reqId")]=url.split("?")[0]
 if row.get("reqId") in ids and "res" in row:counts[(ids[row["reqId"]],row["res"].get("statusCode"))]+=1
print(json.dumps([dict(path=path,status=status,count=count) for (path,status),count in counts.items()]))'
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';import {loadConfig} from '/app/dist/src/config.js';
const pool=new pg.Pool({connectionString:loadConfig().DATABASE_URL});
try {
 const cols=(await pool.query(`SELECT table_name,column_name FROM information_schema.columns WHERE column_name ILIKE '%preferences%' AND table_schema='public'`)).rows;
 console.log('PREFERENCE_COLUMNS',JSON.stringify(cols));
}finally{await pool.end();}
JS
