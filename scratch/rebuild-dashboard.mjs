import { runSSM } from './run-ssm.mjs';

async function main() {
  const script = `
cd /opt/sentinel-grid
git fetch origin main
git reset --hard origin/main
docker build -t sentinel-aws-dashboard:latest -f dashboard/Dockerfile .
cd /opt/sentinel-grid/deploy/aws
docker compose -f docker-compose.aws.yml up -d --force-recreate dashboard
docker compose -f docker-compose.aws.yml ps dashboard
`;
  await runSSM(script);
}

main().catch(console.error);
