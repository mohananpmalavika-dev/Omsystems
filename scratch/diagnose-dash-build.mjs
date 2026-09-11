import { runSSM } from './run-ssm.mjs';

async function main() {
  const script = `
cd /opt/sentinel-grid
git log -n 1 --oneline
docker build --no-cache -t sentinel-aws-dashboard:latest -f dashboard/Dockerfile . > /tmp/dash-build.log 2>&1
echo "BUILD_EXIT_CODE: $?"
tail -n 30 /tmp/dash-build.log
`;
  await runSSM(script);
}

main().catch(console.error);
