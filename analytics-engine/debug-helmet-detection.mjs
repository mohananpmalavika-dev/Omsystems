#!/usr/bin/env node
import path from 'node:path';
import {parseArgs} from 'node:util';
import {loadRgbFrame,openHelmetReplay} from './scripts/helmet-replay.mjs';

async function main(){
  const {values}=parseArgs({options:{frame:{type:'string'},camera:{type:'string'},
    'captured-at':{type:'string'},width:{type:'string'},height:{type:'string'},help:{type:'boolean'}}});
  if(values.help){console.log('node debug-helmet-detection.mjs [--frame IMAGE --captured-at ISO_TIMESTAMP --camera ID] [--width N --height N (raw .rgb only)]');return;}
  if(values.frame&&!values['captured-at'])throw new Error('--captured-at is required for a real frame');
  const frame=values.frame ? await loadRgbFrame({file:path.resolve(values.frame),capturedAt:values['captured-at'],
    width:Number(values.width),height:Number(values.height)},values.camera??'helmet-validation') : null;
  const runtime=await openHelmetReplay();
  try{
    console.log('Effective offline configuration:',JSON.stringify(runtime.config));
    console.log('Model health:',JSON.stringify(runtime.health()));
    if(!runtime.config.evidenceCameras.length)console.log('Head evidence is disabled: use HELMET_HEAD_EVIDENCE_CAMERAS=* or the matching camera ID to test that path.');
    if(frame)console.log(JSON.stringify(await runtime.run(frame),null,2));
    else console.log('Health check only. No camera frame was supplied; this does not validate walking detection.');
    console.log('No production events submitted. One frame cannot prove temporal confirmation or alert latency.');
  }finally{await runtime.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
