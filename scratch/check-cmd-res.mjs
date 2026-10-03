import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== EDGE COMMAND STATUS ===');
console.log(runSql("SELECT id, command_type, status, error, substring(result::text, 1, 500) FROM edge_commands WHERE id = 'b4e9df95-d0b1-471c-8cb7-699883fd95c7';"));
