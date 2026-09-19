import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const installerFile = `KryptonVisionInstaller-v${version}-windows.exe`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const source = (await readFile(join(root, 'installer/windows/sentinel-grid.iss'), 'utf8')).replace(/\r\n/g, '\n');
const manifest = {
  sha256: hash(await readFile(join(root, 'release/edge-agent.exe'))),
  installerFile,
  installerSha256: hash(await readFile(join(root, 'installer/windows/output', installerFile))),
  installerSourceSha256: hash(source),
  ...(process.argv[2]
    ? { signerThumbprint: process.argv[2], signedAt: new Date().toISOString() }
    : { signing: 'unsigned' }),
};
const target = join(root, 'release/windows-release.json');
await writeFile(`${target}.tmp`, `${JSON.stringify(manifest)}\n`);
await rename(`${target}.tmp`, target);
console.log(`Wrote verified artifact hashes for ${installerFile}.`);
