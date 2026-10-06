import {execFileSync} from 'node:child_process';
import {defineConfig} from 'vitest/config';
import config from '../vitest.config.ts';
const baseline=execFileSync('git',['show','4f817046:analytics-engine/src/model-manager.ts'],{encoding:'utf8'});
export default defineConfig({...config,plugins:[{
 name:'baseline-model-session',enforce:'pre',
 transform(_source,id){if(id.replaceAll('\\','/').endsWith('/analytics-engine/src/model-manager.ts'))return {code:baseline,map:null};},
}]});
