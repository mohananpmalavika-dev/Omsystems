import fs from 'node:fs';
const baseline='tmp/presentation-helmet-safe-20261008';
const stage='tmp/presentation-helmet-native-retry-20261008';
for(const dir of ['analytics-engine/src','analytics-engine/test','src/events','scratch']){
  fs.mkdirSync(stage+'/'+dir,{recursive:true});
  fs.cpSync(baseline+'/'+dir,stage+'/'+dir,{recursive:true});
}
const file=stage+'/analytics-engine/src/inference/helmet-head-verification.ts';
let code=fs.readFileSync(file,'utf8');
const old='person.height < 0.35 && person.height * frame.height >= 72';
if(!code.includes(old))throw Error('Unexpected verifier source');
code=code.replace(old,'person.height * frame.height >= 72');
code=code.replace('A full-frame resize can erase a distant head. Search its native-pixel','A full-frame resize can miss a head. Search its native-pixel');
fs.writeFileSync(file,code);
console.log(stage);
