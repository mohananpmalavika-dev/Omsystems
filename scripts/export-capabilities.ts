import fs from 'node:fs';
import path from 'node:path';
import { PLATFORM_CAPABILITIES } from '../config/capabilities/platform-capabilities.js';

const outPath = path.resolve(import.meta.dirname, '../scratch-caps.json');
fs.writeFileSync(outPath, JSON.stringify(PLATFORM_CAPABILITIES, null, 2), 'utf8');
console.log(`Successfully exported ${PLATFORM_CAPABILITIES.length} capabilities to ${outPath}`);
