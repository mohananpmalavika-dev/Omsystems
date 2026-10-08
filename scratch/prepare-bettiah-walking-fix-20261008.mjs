import fs from 'node:fs';
const baseline='tmp/presentation-helmet-native-retry-20261008';
const stage='tmp/bettiah-walking-fix-20261008';
for(const dir of ['analytics-engine/src','analytics-engine/test','src/events','scratch']){
 fs.mkdirSync(stage+'/'+dir,{recursive:true});fs.cpSync(baseline+'/'+dir,stage+'/'+dir,{recursive:true});
}
console.log(stage);
