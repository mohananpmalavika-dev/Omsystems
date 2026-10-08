import fs from 'node:fs';
import {createHash} from 'node:crypto';
const health=await(await fetch('http://localhost:8092/health')).json();
const d=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
const v=fs.readFileSync('/app/dist/analytics-engine/src/inference/helmet-head-verification.js','utf8');
const p=fs.readFileSync('/app/dist/analytics-engine/src/inference/helmet-head-probe.js','utf8');
const {HELMET_HEAD_PROBE_SHA256}=await import('/app/dist/analytics-engine/src/inference/helmet-head-probe.js');
console.log(JSON.stringify({checkedAt:new Date().toISOString(),health,runtime:{detectorSha256:createHash('sha256').update(d).digest('hex'),
verifierSha256:createHash('sha256').update(v).digest('hex'),probeModuleSha256:createHash('sha256').update(p).digest('hex'),headProbeSha256:HELMET_HEAD_PROBE_SHA256,anatomicalFallback:v.includes('anatomicalBox'),
strongPersonGate:d.includes('(person.confidence ?? 0) < 0.8'),minimum20PixelHead:v.includes('head.width * frame.width < 20')}},null,2));
