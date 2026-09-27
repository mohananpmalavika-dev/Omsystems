import fs from 'node:fs';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
import {spawnSync} from 'node:child_process';
const files=['app/control-room/page.tsx','components/live-operations-stage.tsx','components/enhanced-camera-grid.tsx','components/playback-controller.tsx','app/layout.tsx'];
const syntax=[];for(const file of files){const tree=ts.createSourceFile(file,fs.readFileSync('dashboard/'+file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);syntax.push(...tree.parseDiagnostics.map(d=>({file,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')})));}
if(syntax.length){console.log(syntax);process.exit(1);}
const run=spawnSync(process.execPath,['dashboard/node_modules/typescript/bin/tsc','-p','dashboard/tsconfig.typecheck.json','--noEmit'],{encoding:'utf8',maxBuffer:4*1024*1024});
const output=(run.stdout??'')+(run.stderr??'');fs.writeFileSync('tmp/experience-qa/live-stage-typecheck.log',output);const all=output.split('\n').filter(l=>l.includes('error TS'));const result={syntaxErrors:syntax,projectExitCode:run.status,totalTypeErrors:all.length,changedFileErrors:all.filter(line=>files.some(file=>line.includes(file)))};console.log(JSON.stringify(result,null,2));fs.writeFileSync('tmp/experience-qa/live-stage-types.json',JSON.stringify(result,null,2));if(result.changedFileErrors.length||run.error)process.exitCode=1;
