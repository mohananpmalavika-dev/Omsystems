import sharp from 'sharp';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const objects=await loadObjectInference('helmet-head-localizer',.1),classifier=await loadHelmetClassificationInference('helmet');
const {data,info}=await sharp('scratch/helmet-alert-ch6.jpg').raw().toBuffer({resolveWithObject:true});
const frame={cameraId:'test',tenantId:'test',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
for(const head of await objects.run(frame)) {
 console.log(JSON.stringify({head,full:await classifier.run(frame,head.boundingBox),crown:await classifier.run(frame,{...head.boundingBox,height:head.boundingBox.height*.65})}));
}
await manager.shutdown();process.exit(0);
