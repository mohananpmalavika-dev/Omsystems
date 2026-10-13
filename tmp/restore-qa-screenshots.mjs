import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const files = ['calling-desktop.png', 'device-check.png', 'directory-desktop.png', 'directory-mobile.png',
  'incoming-device-desktop.png', 'incoming-device-mobile.png', 'incoming-operator-desktop.png',
  'incoming-operator-mobile.png', 'screen-share-desktop.png', 'video-call-desktop.png', 'video-call-mobile.png'];
for (const file of files) {
  const relative = `tmp/communications-qa/${file}`;
  const target = resolve(root, relative);
  if (!target.startsWith(root + sep)) throw new Error('Invalid screenshot restore path.');
  const data = execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  await writeFile(target, data);
}
console.log('Restored only the 11 test-generated screenshot changes without touching the Git index.');
