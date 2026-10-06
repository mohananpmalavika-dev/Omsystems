import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=process.env.VALIDATION_RUNTIME_ROOT??'/app/dist/analytics-engine/src';
const {getModelManager}=await import(pathToFileURL(path.join(runtime,'model-manager.js')).href);
const {loadPoseInference,loadObjectInference}=await import(pathToFileURL(path.join(runtime,'inference/configured-model-inference.js')).href);
const manager=getModelManager({modelsDirectory:process.env.MODELS_DIR??'/app/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
try{
 const frame={cameraId:'isolated-session-validation',tenantId:'isolated',timestamp:new Date(0),width:320,height:180,imageData:Buffer.alloc(320*180*3)};
 const pose=await loadPoseInference('pose-estimator',.4);
 await pose.run(frame);
 const original=manager.getModelInfo('pose-estimator').model;
 await manager.unloadModel('pose-estimator');
 assert.equal(manager.isModelLoaded('pose-estimator'),false,'The optional pose session must actually be evicted');
 const observations=await pose.run(frame);
 assert.notEqual(manager.getModelInfo('pose-estimator').model,original,'The retained adapter must reload its disposed session');
 const localizer=await loadObjectInference('helmet-head-localizer',.25);
 await localizer.run(frame);
 const retained=await manager.getModel('pose-estimator');
 await manager.unloadModel('pose-estimator');
 // Multiple consumers must share the same newly loaded native session.
 await Promise.all([pose.run(frame),pose.run(frame)]);
 assert.equal(manager.isModelLoaded('pose-estimator'),true);
 assert.deepEqual((await manager.getModel('pose-estimator')).inputNames,retained.inputNames);
 console.log('SESSION_VALIDATION '+JSON.stringify({passed:true,retainedPoseAdapterReloaded:true,concurrentReloadPassed:true,helmetLocalizerPassed:true,observations:observations.length,eventsSubmitted:0}));
}finally{await manager.shutdown();}
