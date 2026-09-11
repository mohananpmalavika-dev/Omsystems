import { runSSM } from './run-ssm.mjs';

async function main() {
  const script = `
cd /opt/sentinel-grid
echo "=== Pulling latest git ==="
git fetch origin main
git reset --hard origin/main

echo "=== Applying migrations ==="
for migration in $(ls -1v /opt/sentinel-grid/database/migrations/*.sql 2>/dev/null); do
  docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid < "$migration" > /dev/null 2>&1 || true
done

echo "=== Building control-plane and dashboard ==="
cd /opt/sentinel-grid/deploy/aws
docker compose -f docker-compose.aws.yml build control-plane
docker compose -f docker-compose.aws.yml build dashboard

echo "=== Recreating containers ==="
docker compose -f docker-compose.aws.yml up -d --force-recreate control-plane dashboard

echo "=== Checking status ==="
sleep 5
docker compose -f docker-compose.aws.yml ps
`;

  await runSSM(script);
}

main().catch(console.error);
