import { runSSM } from './run-ssm.mjs';

const cmd = `docker exec sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "\\dt"`;

await runSSM(cmd);
