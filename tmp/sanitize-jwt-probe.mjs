import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../scratch/test-jwt-call.mjs', import.meta.url);
const source = await readFile(file, 'utf8');
const pattern = /^const JWT_SECRET = .+;$/m;
if (!pattern.test(source)) throw new Error('Expected JWT probe configuration was not found.');
const updated = source.replace(pattern, 'const JWT_SECRET = process.env.JWT_SECRET;\nif (!JWT_SECRET) throw new Error("JWT_SECRET must be supplied through the environment.");');
await writeFile(file, updated, 'utf8');
console.log('JWT probe now requires an environment secret. No secret value was logged.');
