import fs from 'node:fs';
const stage='tmp/presentation-helmet-safe-20261008';
fs.mkdirSync(stage+'/scratch',{recursive:true});
const replay=fs.readFileSync('scratch/replay-helmet-walking-jpeg-20261007.ts','utf8')
 .replaceAll('reports/helmet-walking-jpeg-replay-2026-10-07.json','reports/presentation-helmet-replay-2026-10-08.json');
fs.writeFileSync(stage+'/scratch/replay-presentation.ts',replay);
console.log(stage+'/scratch/replay-presentation.ts');
