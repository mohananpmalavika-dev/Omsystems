import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const stage='tmp/presentation-helmet-native-retry-20261008';
const baseline='tmp/presentation-helmet-safe-20261008';
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=[];
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
const transpile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
for(const file of ['analytics-engine/src/detectors/helmet-detector.ts','analytics-engine/src/inference/helmet-head-verification.ts']){
 const archived=fs.readFileSync(baseline+'/package/runtime/dist/'+file.replace(/\.ts$/,'.js'),'utf8');
 if(normalize(transpile(fs.readFileSync(baseline+'/'+file,'utf8')))!==normalize(archived))
   throw Error('Compiler output differs from validated baseline: '+file);
 const source=stage+'/'+file;
 for(const [relative,text] of [['source/'+file,fs.readFileSync(source,'utf8')],['runtime/dist/'+file.replace(/\.ts$/,'.js'),transpile(fs.readFileSync(source,'utf8'))]]){
   const output=stage+'/package/'+relative;fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,text);
   files.push({file:relative,sha256:sha(output)});
 }
}
fs.writeFileSync(stage+'/package/manifest.json',JSON.stringify({change:'Native head localization for nearby people; unchanged person and head evidence gates',files},null,2));
let release=fs.readFileSync('scratch/restore-presentation-helmet-20261008.mjs','utf8');
release=release.replaceAll(baseline,stage)
 .replaceAll('presentation-helmet-candidate-tests-2026-10-08.json','presentation-native-retry-tests-2026-10-08.json')
 .replaceAll('presentation-helmet-replay-2026-10-08.json','presentation-native-retry-replay-2026-10-08.json')
 .replace('tests.numTotalTests<80','tests.numTotalTests<82')
 .replace('replay.summary.negativeFrames!==19','replay.summary.negativeFrames!==20')
 .replace('9b0405bbfd55c33bbb942dfe3b627a730c82a902428d89c3c42d183d19f495a5','e303a9bc20b0b77201f6cccfe85b76f5ec0a125a4f24d5c45bf77bf576576d92')
 .replace('bcfde15f9bf41ec0f01c9bbbc972c3b4aec3b3c104cf4a2ae12b6ba4ac1e64cb','448cedb3dbe673f43b51d7f4e7f38a5ff15a36c3b426f97b4be523598c44f27d')
 .replace('presentation-helmet-restoration-2026-10-08.json','presentation-native-retry-deployment-2026-10-08.json');
// Only substitute expected post-deployment hashes in the health check; preserve preflight hashes.
const idx=release.indexOf('for tick in');
const detector=files.find(f=>f.file.endsWith('helmet-detector.js')).sha256;
const verifier=files.find(f=>f.file.endsWith('helmet-head-verification.js')).sha256;
release=release.slice(0,idx)+release.slice(idx)
 .replace('e303a9bc20b0b77201f6cccfe85b76f5ec0a125a4f24d5c45bf77bf576576d92',detector)
 .replace('448cedb3dbe673f43b51d7f4e7f38a5ff15a36c3b426f97b4be523598c44f27d',verifier);
const check=`const bettiah=JSON.parse(fs.readFileSync('reports/presentation-bettiah-native-retry-2026-10-08.json','utf8'));
if(!bettiah.rows.find(r=>r.file.endsWith('frame-039.jpg'))?.alerts.length)throw Error('Bettiah seated head recovery failed');
`;
release=release.replace("const stamp=new Date()",check+"const stamp=new Date()");
fs.writeFileSync('scratch/deploy-presentation-native-retry-20261008.mjs',release);
console.log(JSON.stringify({stage,files},null,2));
