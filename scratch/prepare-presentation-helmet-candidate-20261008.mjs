import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const stage='tmp/presentation-helmet-safe-20261008';
const original='tmp/helmet-walking-pilot-20261007172532329';
const prior=JSON.parse(fs.readFileSync(original+'/validation.json','utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync(stage,{recursive:true});
fs.cpSync('analytics-engine/src',stage+'/analytics-engine/src',{recursive:true});
fs.cpSync('src/events',stage+'/src/events',{recursive:true});
const source=['analytics-engine/src/detectors/helmet-detector.ts','analytics-engine/src/inference/helmet-head-verification.ts'];
const files=[];
for(const file of source){
 const from=original+'/source/'+file;
 const expected=prior.files.find(f=>f.file===file)?.sha256;
 if(hash(from)!==expected)throw Error('Archived source checksum mismatch: '+file);
 fs.copyFileSync(from,stage+'/'+file);
 for(const [relative,fromPath,sha] of [
  ['source/'+file,from,expected],
  ['runtime/dist/'+file.replace(/\.ts$/,'.js'),original+'/runtime/analytics/dist/'+file.replace(/\.ts$/,'.js'),prior.runtime.find(f=>f.container==='analytics'&&f.file===file.replace(/\.ts$/,'.js'))?.sha256]
 ]){
  if(hash(fromPath)!==sha)throw Error('Archived runtime checksum mismatch');
  const to=stage+'/package/'+relative;fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(fromPath,to);
  files.push({file:relative,sha256:sha});
 }
}
for(const test of ['helmet-head-verification.test.ts','helmet-false-alarms.test.ts']){
 fs.mkdirSync(stage+'/analytics-engine/test',{recursive:true});
 fs.copyFileSync('analytics-engine/test/'+test,stage+'/analytics-engine/test/'+test);
}
fs.writeFileSync(stage+'/package/manifest.json',JSON.stringify({version:'1.3.2',files},null,2));
console.log(JSON.stringify({stage,files},null,2));
