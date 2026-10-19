import { execSync } from "node:child_process";

const code = `
const ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch1#sub';
const agentId = '128f918d-3943-4049-af05-36857b66d41b';

const pg = await import('pg');
const pool = new pg.default.Pool({ connectionString: 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable' });

const baseReference = ref.replace(/#(?:main|sub)$/, "");
const result = await pool.query(
  \`SELECT secret.encrypted_uri
   FROM central_stream_secrets secret
   JOIN edge_agents agent ON agent.id = secret.edge_agent_id
   LEFT JOIN cameras camera ON camera.connection_secret_ref = $2
   WHERE secret.reference = $1 AND agent.credential_revoked_at IS NULL
     AND (
       $3::uuid IS NULL
       OR agent.id = $3::uuid
       OR (camera.id IS NOT NULL AND (
         camera.edge_agent_id = $3::uuid
         OR EXISTS (
           SELECT 1 FROM edge_agent_branch_assignments eaba
           WHERE eaba.edge_agent_id = $3::uuid AND eaba.branch_node_id = camera.branch_node_id
         )
         OR EXISTS (
           SELECT 1 FROM edge_agents ea
           WHERE ea.id = $3::uuid AND ea.branch_node_id = camera.branch_node_id
         )
       ))
     )
   LIMIT 1\`,
  [ref, baseReference, agentId]
);

console.log("Rows returned for #sub:", result.rows.length);
if (result.rows.length > 0) {
  const { createDecipheriv } = await import('node:crypto');
  const key = Buffer.from('eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=', 'base64');
  const payload = Buffer.from(result.rows[0].encrypted_uri, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAAD(Buffer.from(ref));
  decipher.setAuthTag(payload.subarray(12, 28));
  const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
  console.log("Decrypted sourceUri:", decrypted);
}
await pool.end();
`;

const b64 = Buffer.from(code).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: "utf8" }));
