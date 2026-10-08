import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const stage='tmp/bettiah-walking-fix-20261008';
const sourceFiles=['analytics-engine/src/detectors/helmet-detector.ts','analytics-engine/src/inference/helmet-head-verification.ts','analytics-engine/src/inference/helmet-head-probe.ts','analytics-engine/test/helmet-head-verification.test.ts'];
const normalize=s=>s.replace(/\r\n/g,'\n');
const before=new Map();
for(const file of sourceFiles){
 const current=fs.readFileSync(file,'utf8'),committed=spawnSync('git',['show','61f3644c:'+file],{encoding:'utf8'});
 if(committed.status!==0||normalize(current)!==normalize(committed.stdout))throw Error('Local source changed since review; merge explicitly: '+file);
 before.set(file,current);
}
const artifact=JSON.parse(fs.readFileSync(stage+'/head-probe.json','utf8'));
const heldOut=new Set(artifact.heldOutImages);
const feedback=JSON.parse(fs.readFileSync('reports/bettiah-walking-feedback-features-2026-10-08.json','utf8'));
const regression=JSON.parse(fs.readFileSync('reports/helmet-semantic-features-2026-10-07.json','utf8')).filter(r=>heldOut.has(r.file));
if(feedback.length!==4||regression.length!==138)throw Error('Classifier fixture mismatch');
const fixture={scope:'One confirmed missed image is training feedback; the 16 held-out images were excluded from training.',
 trainingImages:artifact.trainingImages,heldOutImages:artifact.heldOutImages,
 feedback:feedback.map(r=>({file:r.file,resolution:r.resolution,padding:r.padding,expectedHelmet:r.expectedHelmet,feature:r.feature})),
 heldOut:regression.map(r=>({file:r.file,expectedHelmet:r.expectedHelmet,feature:r.feature}))};
const fixturePath='analytics-engine/test/fixtures/helmet-head-regression-20261008.json.gz';
const testPath='analytics-engine/test/helmet-classifier-feedback.test.ts';
if(fs.existsSync(fixturePath)||fs.existsSync(testPath))throw Error('Refusing to overwrite existing classifier fixtures');
for(const file of sourceFiles){const backup=stage+'/local-source-backup/'+file+(file.endsWith('.test.ts')?'.bak':'');fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,before.get(file));}
for(const file of sourceFiles)if(fs.readFileSync(file,'utf8')!==before.get(file))throw Error('Source changed during integration');
for(const file of sourceFiles)fs.copyFileSync(stage+'/'+file,file);
fs.mkdirSync(path.dirname(fixturePath),{recursive:true});fs.writeFileSync(fixturePath,gzipSync(Buffer.from(JSON.stringify(fixture))));
fs.writeFileSync(testPath,`import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {describe,expect,it} from 'vitest';
import {classifyHelmetHeadEmbedding} from '../src/inference/helmet-head-classification.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/helmet-head-regression-20261008.json.gz',import.meta.url))).toString());
describe('corrected helmet head classifier',()=>{
 it('reproduces the bent-forward training feedback at both frame sizes and crop contexts',()=>{
  expect(fixture.feedback).toHaveLength(4);
  for(const row of fixture.feedback)expect(classifyHelmetHeadEmbedding(row.feature).wearingHelmetConfidence).toBeGreaterThanOrEqual(.9);
 });
 it('retains independently held-out worn-helmet and bare-head labels',()=>{
  const heldOut=new Set(fixture.heldOutImages);
  expect(fixture.trainingImages.some((file:string)=>heldOut.has(file))).toBe(false);
  expect(fixture.heldOut).toHaveLength(138);
  for(const row of fixture.heldOut){
   const probability=classifyHelmetHeadEmbedding(row.feature).wearingHelmetConfidence;
   expect(probability>=.8,row.file+': '+probability).toBe(row.expectedHelmet);
  }
 });
});
`);
const files=sourceFiles.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
fs.writeFileSync('reports/bettiah-walking-local-integration-2026-10-08.json',JSON.stringify({completedAt:new Date().toISOString(),files,fixture:fixturePath,backup:stage+'/local-source-backup'},null,2));
console.log(JSON.stringify({files,fixtureBytes:fs.statSync(fixturePath).size},null,2));
