set -e
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';import fs from 'node:fs';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const ids=['f5781a86-8527-4a30-a94a-3f256555fbcb','f0b4f55e-00c0-442c-a0e1-3d6a05150bdf','6fbdbee4-1d81-40f9-835d-33e8a93a7486'];
for(const id of ids){const {rows}=await db.query('SELECT id,camera_id,occurred_at,metadata FROM analytics_events WHERE id=$1',[id]);for(const row of rows){const m=row.metadata||{};console.log(JSON.stringify({...row,metadata:Object.fromEntries(Object.entries(m).filter(([key])=>!key.toLowerCase().includes('base64')))}));if(m.snapshotBase64){const p='/tmp/helmet-false-'+id+'.jpg';fs.writeFileSync(p,Buffer.from(m.snapshotBase64.replace(/^data:image\/[^;]+;base64,/,''),'base64'));console.log('EXPORTED',p);}}}
await db.end();
JS
for id in f5781a86-8527-4a30-a94a-3f256555fbcb f0b4f55e-00c0-442c-a0e1-3d6a05150bdf 6fbdbee4-1d81-40f9-835d-33e8a93a7486; do
 sudo docker cp sentinel-gcp-control-plane:/tmp/helmet-false-$id.jpg /tmp/helmet-false-$id.jpg
 sudo chmod 644 /tmp/helmet-false-$id.jpg
done
