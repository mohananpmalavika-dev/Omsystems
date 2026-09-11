import { runSSM } from './run-ssm.mjs';

async function main() {
  const script = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT count(*) FROM operational_health_telemetry;" -c "SELECT count(*) FROM resource_nodes WHERE type = 'branch';"` ;
  await runSSM(script);
}

main().catch(console.error);
