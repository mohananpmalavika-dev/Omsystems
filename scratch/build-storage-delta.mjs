import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const key = await readFile('config/keys/evidence-signing.pem', 'utf8');
execFileSync(process.execPath, ['edge-agent/scripts/build-delta-bundle.mjs'], {
  stdio: 'inherit', env: {...process.env, EDGE_UPDATE_SIGNING_PRIVATE_KEY: key,
    CONTROL_PLANE_PUBLIC_URL: 'https://34-14-220-41.sslip.io'},
});
