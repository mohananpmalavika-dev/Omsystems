import { runSSM } from './run-ssm.mjs';

async function main() {
  const script = `
cd /opt/sentinel-grid
git fetch origin main
git reset --hard origin/main
git log -n 1 --oneline
cd /opt/sentinel-grid/deploy/aws
docker compose -f docker-compose.aws.yml build --no-cache control-plane
docker compose -f docker-compose.aws.yml up -d --force-recreate control-plane
docker compose -f docker-compose.aws.yml ps control-plane
`;
  await runSSM(script);
}

main().catch(console.error);
