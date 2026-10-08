import { execSync } from 'child_process';

const script = `
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const camId = 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda';

// Check ai_camera_assignments
const aica = await db.query('SELECT * FROM ai_camera_assignments WHERE camera_id = $1', [camId]);
console.log('ai_camera_assignments:', aica.rows);

// Check nbfc_analytics_rules
const nbfc = await db.query('SELECT * FROM nbfc_analytics_rules LIMIT 5');
console.log('nbfc_analytics_rules sample:', nbfc.rows);

// Check all tables with column camera_id
const tables = await db.query(\`
  SELECT table_name 
  FROM information_schema.columns 
  WHERE column_name = 'camera_id' AND table_schema = 'public';
\`);
console.log('Tables with camera_id:', tables.rows.map(r => r.table_name));

for (const t of tables.rows.map(r => r.table_name)) {
  try {
    const q = await db.query(\`SELECT count(*) FROM "\${t}" WHERE camera_id = $1\`, [camId]);
    if (parseInt(q.rows[0].count) > 0) {
      console.log(\`Found \${q.rows[0].count} rows in table \${t} for this camera\`);
    }
  } catch(e) {}
}

await db.end();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
