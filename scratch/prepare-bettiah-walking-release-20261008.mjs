import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {createHash} from 'node:crypto';
const stage='tmp/bettiah-walking-fix-20261008',baseline='tmp/presentation-helmet-native-retry-20261008';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const transpile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const sourceFiles=['analytics-engine/src/detectors/helmet-detector.ts','analytics-engine/src/inference/helmet-head-verification.ts','analytics-engine/src/inference/helmet-head-probe.ts'];
const files=[],oldRuntime={},newRuntime={};
for(const file of sourceFiles){
 const old=transpile(fs.readFileSync(baseline+'/'+file,'utf8'));
 oldRuntime[file.replace(/\.ts$/,'.js')]=createHash('sha256').update(old).digest('hex');
 const source=fs.readFileSync(stage+'/'+file,'utf8');
 for(const [relative,content] of [['source/'+file,source],['runtime/dist/'+file.replace(/\.ts$/,'.js'),transpile(source)]]){
  const output=stage+'/package/'+relative;fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,content);
  files.push({file:relative,sha256:hash(output)});
  if(relative.startsWith('runtime/'))newRuntime[file.replace(/\.ts$/,'.js')]=hash(output);
 }
}
for(const [from,relative] of [['scratch/bettiah-entry-20261008/ch5/frame-036.jpg','fixtures/walking.jpg'],['scratch/bettiah-entry-20261008/ch2/frame-015.jpg','fixtures/carried.jpg'],['scratch/bettiah-walking-server-replay-20261008.mjs','fixtures/replay.mjs']]){
 const output=stage+'/package/'+relative;fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(from,output);files.push({file:relative,sha256:hash(output)});
}
fs.writeFileSync(stage+'/package/manifest.json',JSON.stringify({version:'1.3.3',trainingFeedbackFrames:1,files},null,2));
let release=fs.readFileSync('scratch/restore-presentation-helmet-20261008.mjs','utf8');
const replace=(a,b)=>{if(!release.includes(a))throw Error('Missing release template anchor: '+a.slice(0,80));release=release.replace(a,b);};
release=release.replaceAll('tmp/presentation-helmet-safe-20261008',stage)
 .replaceAll('presentation-helmet-candidate-tests-2026-10-08.json','bettiah-walking-fix-tests-2026-10-08.json')
 .replaceAll('presentation-helmet-replay-2026-10-08.json','bettiah-walking-regression-replay-2026-10-08.json')
 .replace('tests.numTotalTests<80','tests.numTotalTests<84').replace('replay.summary.negativeFrames!==19','replay.summary.negativeFrames!==53')
 .replace('9b0405bbfd55c33bbb942dfe3b627a730c82a902428d89c3c42d183d19f495a5',oldRuntime[sourceFiles[0].replace('.ts','.js')])
 .replace('bcfde15f9bf41ec0f01c9bbbc972c3b4aec3b3c104cf4a2ae12b6ba4ac1e64cb',oldRuntime[sourceFiles[1].replace('.ts','.js')])
 .replace('presentation-helmet-restoration-2026-10-08.json','bettiah-walking-fix-deployment-2026-10-08.json');
replace("const stamp=new Date()",`const bettiah=JSON.parse(fs.readFileSync('reports/bettiah-walking-fixed-replay-2026-10-08.json','utf8'));
if(!bettiah.rows.find(r=>r.file.endsWith('frame-036.jpg'))?.alerts.length)throw Error('Bettiah standing/bent-forward reproduction failed');
const stamp=new Date()`);
replace('source runtime manifest.json','source runtime fixtures manifest.json');
const probeSource='analytics-engine/src/inference/helmet-head-probe.ts',probeRuntime=probeSource.replace('.ts','.js');
replace('throw Error("Runtime changed since audit; recheck before restoring")',`throw Error("Runtime changed since audit; recheck before restoring");if(hash("/app/dist/${probeRuntime}")!=="${oldRuntime[probeRuntime]}")throw Error("Probe changed since audit");if(hash("/app/models/safety/helmet-head-embedding.onnx")!=="583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299")throw Error("Feature model changed")`);
replace('sudo docker commit sentinel-gcp-analytics-engine',`sudo cp "$root/${probeSource}" "$release/backup/${probeSource}"
sudo docker commit sentinel-gcp-analytics-engine`);
replace('sudo docker tag sentinel-presentation-analytics:before-',`sudo cp "$release/backup/${probeSource}" "$root/${probeSource}"
sudo docker tag sentinel-presentation-analytics:before-`);
replace('sudo docker tag sentinel-gcp-analytics-engine:presentation-',`sudo cp "$release/package/source/${probeSource}" "$root/${probeSource}"
sudo docker tag sentinel-gcp-analytics-engine:presentation-`);
const idx=release.indexOf('for tick in');
release=release.slice(0,idx)+release.slice(idx).replace('e303a9bc20b0b77201f6cccfe85b76f5ec0a125a4f24d5c45bf77bf576576d92',newRuntime[sourceFiles[0].replace('.ts','.js')])
 .replace('448cedb3dbe673f43b51d7f4e7f38a5ff15a36c3b426f97b4be523598c44f27d',newRuntime[sourceFiles[1].replace('.ts','.js')]);
replace(')process.exit(1);console.log(JSON.stringify({aiState:',`||hash("/app/dist/${probeRuntime}")!=="${newRuntime[probeRuntime]}")process.exit(1);console.log(JSON.stringify({aiState:`);
replace("  echo 'RESTORE_SUCCESS",`  sudo docker cp "$release/package/fixtures" "sentinel-gcp-analytics-engine:/tmp/bettiah-walking-${'${stamp}'}"
  sudo docker exec sentinel-gcp-analytics-engine node "/tmp/bettiah-walking-${'${stamp}'}/replay.mjs" "/tmp/bettiah-walking-${'${stamp}'}"
  echo 'RESTORE_SUCCESS`);
replace("(r.error?.message??r.status));}","(r.error?.message??r.status));return r.stdout;}");
replace('run(`gcloud compute ssh', 'const remoteOutput=run(`gcloud compute ssh');
replace("fs.writeFileSync('reports/bettiah-walking-fix-deployment-2026-10-08.json'",`const validationLine=remoteOutput.split(/\\r?\\n/).find(line=>line.startsWith('BETTIAH_REPLAY_VALIDATION '));
if(!validationLine)throw Error('Missing deployed runtime replay verification');
const serverReplay=JSON.parse(validationLine.slice('BETTIAH_REPLAY_VALIDATION '.length));
fs.writeFileSync('reports/bettiah-walking-fix-deployment-2026-10-08.json'`);
replace('tests:tests.numPassedTests,replay:replay.summary','tests:tests.numPassedTests,replay:replay.summary,serverReplay,version:"1.3.3",trainingFeedbackFrames:1');
fs.writeFileSync('scratch/deploy-bettiah-walking-fix-20261008.mjs',release);
console.log(JSON.stringify({stage,oldRuntime,newRuntime,files},null,2));
