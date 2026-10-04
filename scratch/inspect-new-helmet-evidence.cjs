const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const client = new Client({connectionString:process.env.DATABASE_URL}); await client.connect();
  const {rows} = await client.query('SELECT id,occurred_at,confidence,model_version,snapshot_reference,metadata FROM analytics_events WHERE id=$1', ['495a0460-55e4-4937-9ad8-7cc88a8b47bd']);
  for (const row of rows) {
    const metadata=row.metadata || {};
    console.log(JSON.stringify({...row,metadata:undefined,metadataKeys:Object.keys(metadata),objects:metadata.objects}));
    for (const [key,value] of Object.entries(metadata)) {
      if (typeof value==='string' && value.length>1000 && key==='snapshotBase64') {
        const encoded=value.replace(/^data:image\/[^;]+;base64,/, '');
        fs.writeFileSync('/tmp/helmet-new-false-alert-raw.jpg',Buffer.from(encoded,'base64'));
        console.log(JSON.stringify({exported:key,bytes:fs.statSync('/tmp/helmet-new-false-alert-raw.jpg').size}));
      }
    }
  }
  await client.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
