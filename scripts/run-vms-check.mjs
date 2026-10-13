import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2];
const regression = ['test/first-class-playback.test.ts', 'test/mobile-operations.routes.test.ts',
  'dashboard/test/mobile-proxy.test.ts', 'test/authorization.test.ts', 'test/migration-failure-truth.test.ts', 'test/security-audit.test.ts'];
const checks = {
  'root-build': [['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], ['scripts/build-communications.mjs']],
  'test-types': [['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json', '--noEmit']],
  'analytics-types': [['node_modules/typescript/bin/tsc', '-p', 'analytics-engine/tsconfig.json', '--noEmit']],
  regression: [['node_modules/vitest/vitest.mjs', 'run', ...regression, '--maxWorkers=1', '--hookTimeout=60000',
    '--reporter=default', '--reporter=json', '--outputFile.json=reports/vms-continued-regression-2026-10-13.json']],
  'secret-scan': [['scripts/secret-scan.mjs']],
};
if (!Object.hasOwn(checks, mode)) throw new Error(`Choose ${Object.keys(checks).join(', ')}.`);
await mkdir(resolve(root, 'reports'), { recursive: true });
let output = '', code = 0;
for (const args of checks[mode]) {
  code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject); child.on('close', exit => done(exit ?? 1));
  });
  if (code) break;
}
const prefix = resolve(root, `reports/vms-${mode}-check-2026-10-13`);
await writeFile(`${prefix}.log`, output);
await writeFile(`${prefix}.json`, JSON.stringify({ mode, exitCode: code, passed: code === 0 }, null, 2));
console.log(`${mode}: ${code === 0 ? 'passed' : 'failed'} (exit ${code}). See reports/vms-${mode}-check-2026-10-13.log`);
process.exitCode = code;
