set -e
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';import sharp from 'sharp';
import {AnalyticsPipeline} from './dist/analytics-engine/src/analytics-pipeline.js';
import {getModelManager} from './dist/analytics-engine/src/model-manager.js';
console.log('THRESHOLDS',JSON.stringify({object:process.env.OBJECT_CONFIDENCE_THRESHOLD,helmet:process.env.HELMET_CONFIDENCE_THRESHOLD}));
const pipeline=new AnalyticsPipeline();await pipeline.initialize();
const detector=pipeline.getDetector('helmet');console.log('EFFECTIVE',JSON.stringify({object:pipeline.getDetector('object').config,helmet:detector.MIN_CONFIDENCE,person:detector.CLASSIFIED_PERSON_CONFIDENCE}));
const {data,info}=await sharp('/tmp/helmet-alert-ch2.jpg').removeAlpha().raw().toBuffer({resolveWithObject:true});
const frame={cameraId:'diagnostic-pipeline',tenantId:'diagnostic-pipeline',imageData:data,width:info.width,height:info.height};
const rules=[{id:'diagnostic',cameraId:frame.cameraId,detectionType:'helmet-worn',enabled:true,minConfidence:.7,minDurationSeconds:1}];
for(const seconds of [0,2,4]){const events=await pipeline.processFrame({...frame,timestamp:new Date(seconds*1000)},rules);console.log('PIPELINE',JSON.stringify({seconds,events:events.map(e=>({type:e.detectionType,confidence:e.confidence})),objects:pipeline.getDetector('person').getHealth()}));}
await pipeline.cleanup();await getModelManager().shutdown();process.exit(0);
JS
