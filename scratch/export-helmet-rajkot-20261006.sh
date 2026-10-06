#!/usr/bin/env bash
set -eu
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';import fs from 'node:fs';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try {
 const {rows}=await db.query(`SELECT id,camera_id,occurred_at,model_version,metadata FROM analytics_events
 WHERE camera_id=$1 AND detection_type='helmet-worn' AND occurred_at BETWEEN '2026-10-06T12:50:00Z' AND '2026-10-06T12:56:00Z'
 ORDER BY occurred_at LIMIT 5`,['6e5e3e6e-48b3-49ce-ac57-0b33bf3135b7']);
 for(let i=0;i<rows.length;i++){
  const row=rows[i],m=row.metadata||{};
  console.log(JSON.stringify({...row,metadata:Object.fromEntries(Object.entries(m).filter(([key])=>!key.toLowerCase().includes('base64')))}));
  if(m.snapshotBase64){const p='/tmp/helmet-rajkot-original-'+i+'.jpg';fs.writeFileSync(p,Buffer.from(m.snapshotBase64.replace(/^data:image\/[^;]+;base64,/,''),'base64'));console.log('EXPORTED',p);}
 }
}finally{await db.end();}
JS
for i in 0 1 2; do
 sudo docker cp sentinel-gcp-control-plane:/tmp/helmet-rajkot-original-$i.jpg /tmp/helmet-rajkot-original-$i.jpg
 sudo chmod 644 /tmp/helmet-rajkot-original-$i.jpg
done
