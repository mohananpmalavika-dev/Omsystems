import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=['analytics-engine/src/detectors/helmet-detector.ts','analytics-engine/src/inference/helmet-head-verification.ts'];
const baseline=new Map(files.map(file=>[path.resolve(root,file).replaceAll('\\','/'),execFileSync('git',['show',`HEAD:${file}`],{cwd:root,encoding:'utf8'})]));
export default {
 root:path.join(root,'analytics-engine'),
 plugins:[{name:'helmet-head-baseline',enforce:'pre',load(id){return baseline.get(id.replaceAll('\\','/').split('?')[0])??null;}}],
 test:{include:['test/specialty-inference.test.ts','test/shutter-detector.test.ts'],globals:true,maxWorkers:1,testTimeout:60000,hookTimeout:60000},
};
