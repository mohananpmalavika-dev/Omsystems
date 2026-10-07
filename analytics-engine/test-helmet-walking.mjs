#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {loadReplayCases,loadRgbFrame,openHelmetReplay,evaluateReplayCase,helmetReplayConfiguration} from './scripts/helmet-replay.mjs';

async function main(){
  const {values}=parseArgs({options:{manifest:{type:'string'},camera:{type:'string'},output:{type:'string'},help:{type:'boolean'}}});
  if(values.help){console.log('node test-helmet-walking.mjs --manifest cases.json [--camera ID] [--output report.json]');return;}
  if(!values.manifest)throw new Error('--manifest is required; missing images are a failure, not a skipped pass');
  const cases=await loadReplayCases(values.manifest);
  const configuration=helmetReplayConfiguration();
  if(!configuration.fastAlert&&cases.some(item=>item.expectedHelmetWearers>0&&item.frames.length<2))
    throw new Error('With fast alerts disabled, positive cases need distinct real consecutive captures');
  const runtime=await openHelmetReplay();
  try{
    console.log('Effective offline configuration:',JSON.stringify(runtime.config));
    console.log('No events or alerts are submitted to production.');
    const results=[];
    for(const item of cases){
      await runtime.reset();
      const observations=[];
      for(const sample of item.frames){
        const frame=await loadRgbFrame(sample,item.cameraId??values.camera??'helmet-validation');
        observations.push(await runtime.run(frame));
      }
      const result=evaluateReplayCase(item,observations);results.push(result);
      console.log(JSON.stringify({name:result.name,passed:result.passed,
        expectedHelmetWearers:result.expectedHelmetWearers,maxHelmetWearers:result.maxHelmetWearers}));
    }
    const report={configuration:runtime.config,health:runtime.health(),results,
      summary:{cases:results.length,passed:results.filter(item=>item.passed).length,
        failed:results.filter(item=>!item.passed).length,productionEventsSubmitted:0}};
    if(values.output)await writeFile(values.output,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report.summary));
    if(report.summary.failed)process.exitCode=1;
  }finally{await runtime.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
