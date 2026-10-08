import fs from 'node:fs';
import {createHash} from 'node:crypto';
const h=await(await fetch('http://localhost:8092/health')).json();
const hashes={};
for(const f of ['detectors/helmet-detector.js','inference/helmet-head-verification.js','inference/helmet-head-probe.js','inference/helmet-head-classification.js','model-manager.js'])hashes[f]=createHash('sha256').update(fs.readFileSync('/app/dist/analytics-engine/src/'+f)).digest('hex');
const cameras=[];
for(const id of ['4a2f17b5-08e9-401a-84f6-6489c41970f9','d02f79e9-0615-4df6-a604-d3e4b8bde9b2']){const r=await fetch('http://localhost:8092/v1/analytics/cameras/'+id+'/status',{headers:{'x-analytics-source-key':process.env.ANALYTICS_ENGINE_SHARED_KEY||''}});const c=r.ok?await r.json():null;cameras.push({id,status:r.status,stream:c?.stream,inference:c?.inference,detection:c?.detection});}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),aiState:h.aiState,helmet:h.pipeline?.detectors?.helmet,received:h.received,failed:h.failed,lastAcceptedAt:h.lastAcceptedAt,headEvidence:process.env.HELMET_HEAD_EVIDENCE_CAMERAS,confidence:process.env.HELMET_CONFIDENCE_THRESHOLD,fastAlert:process.env.HELMET_FAST_ALERT,hashes,cameras},null,2));
