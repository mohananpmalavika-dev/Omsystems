import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const commDir = path.resolve('src/communications');

if (!fs.existsSync(commDir)) {
  console.log('No src/communications directory found, skipping.');
  process.exit(0);
}

function getTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTsFiles(res));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.includes('.test.')) {
      files.push(res);
    }
  }
  return files;
}

const files = getTsFiles(commDir);
if (files.length === 0) {
  console.log('No TypeScript files in src/communications to compile.');
  process.exit(0);
}

try {
  await esbuild.build({
    entryPoints: files,
    outdir: 'dist/src/communications',
    outbase: 'src/communications',
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  console.log(`Successfully compiled ${files.length} communications TypeScript files to dist/src/communications.`);
} catch (err) {
  console.error('Failed to compile communications files:', err);
  process.exit(1);
}
