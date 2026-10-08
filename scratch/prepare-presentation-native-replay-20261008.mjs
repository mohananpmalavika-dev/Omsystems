import fs from 'node:fs';
const stage='tmp/presentation-helmet-native-retry-20261008';
const file=stage+'/scratch/replay-presentation.ts';
let code=fs.readFileSync(file,'utf8');
code=code.replace("negatives.push({file:'tmp/helmet-negative-paddle.png',group:'hat-control'});", "negatives.push({file:'tmp/helmet-negative-paddle.png',group:'hat-control'});\nnegatives.push({file:'scratch/bettiah-entry-20261008/ch2/frame-015.jpg',group:'carried-helmet-control'});");
code=code.replace('reports/presentation-helmet-replay-2026-10-08.json','reports/presentation-native-retry-replay-2026-10-08.json');
fs.writeFileSync(file,code);
