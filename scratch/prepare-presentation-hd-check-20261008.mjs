import fs from 'node:fs';
const stage='tmp/presentation-helmet-native-retry-20261008/scratch/';
let code=fs.readFileSync(stage+'trace-walking.ts','utf8');
code=code.replace('resize(640,360)','resize(960,540)').replace('presentation-walking-trace-2026-10-08.json','presentation-walking-hd-trace-2026-10-08.json');
fs.writeFileSync(stage+'trace-walking-hd.ts',code);
