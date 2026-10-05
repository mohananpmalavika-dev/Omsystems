import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import ts from 'typescript';
const stage=resolve('tmp/opening-settings-package');mkdirSync(stage,{recursive:true});
const files=['src/analytics/nbfc-rule-repository.ts','src/analytics/nbfc-rule-engine.service.ts','src/routes/nbfc-analytics.routes.ts',
 'dashboard/app/nbfc-operations/page.tsx','dashboard/components/nbfc-rules/nbfc-rules-workspace.tsx'];
const plan={files:[],apiPatch:{path:'dashboard/lib/api-client.ts',
 before:'policy: Pick<BranchOpeningPolicy, "openingStart" | "openingEnd" | "timezone" | "activeDays" | "graceSeconds">)',
 after:'policy: Pick<BranchOpeningPolicy, "openingStart" | "openingEnd" | "timezone" | "activeDays" | "graceSeconds"> & { enabled?: boolean })'}};
for(const path of files){
 const before=execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'}).replaceAll('\r\n','\n');
 const contents=readFileSync(path,'utf8').replaceAll('\r\n','\n');
 plan.files.push({path,beforeHash:createHash('sha256').update(before).digest('hex')});
 const dest=resolve(stage,'source',path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,contents);
 if(path.startsWith('src/')){
  const output=resolve(stage,'dist',path.replace(/\.ts$/,'.js'));mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,ts.transpileModule(contents,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,esModuleInterop:true}}).outputText);
 }
}
for(const path of ['database/migrations/20261006_branch_opening_defaults.sql','scripts/verify-opening-defaults.mjs','scratch/verify-opening-settings-api-20261006.mjs']){
 const dest=resolve(stage,'source',path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(path));
}
writeFileSync(resolve(stage,'plan.json'),JSON.stringify(plan,null,2));
execFileSync('tar',['-czf',resolve('tmp/opening-settings-20261006.tar.gz'),'-C',stage,'.']);
console.log('Prepared opening settings package with source baseline checks');
