import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const engineRoot=fileURLToPath(new URL('../',import.meta.url));
export function helmetReplayConfiguration(environment=process.env) {
  const probability=(name,fallback)=>{
    const value=Number(environment[name]);
    return Number.isFinite(value)&&value>=0&&value<=1 ? value : fallback;
  };
  return {confidenceThreshold:probability('HELMET_CONFIDENCE_THRESHOLD',.75),
    objectThreshold:probability('OBJECT_CONFIDENCE_THRESHOLD',.35),
    fastAlert:environment.HELMET_FAST_ALERT!=='false',
    evidenceCameras:(environment.HELMET_HEAD_EVIDENCE_CAMERAS??'').split(',').map(id=>id.trim()).filter(Boolean)};
}

export async function loadRgbFrame(sample,cameraId) {
  const timestamp=new Date(sample.capturedAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('A real capturedAt timestamp is required');
  let imageData,width,height;
  if (path.extname(sample.file).toLowerCase()==='.rgb') {
    ({width,height}=sample);
    if (!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>4096*2160)
      throw new Error('RGB frames require valid source width and height');
    imageData=await readFile(sample.file);
  } else {
    const decoded=await sharp(sample.file,{limitInputPixels:4096*2160}).removeAlpha().toColourspace('srgb')
      .raw().toBuffer({resolveWithObject:true});
    ({width,height}=decoded.info); imageData=decoded.data;
  }
  if (imageData.length!==width*height*3) throw new Error('Frame must contain exactly width * height * 3 RGB24 bytes');
  return {cameraId,tenantId:'offline-helmet-validation',timestamp,width,height,imageData,
    metadata:{inferenceMode:'local-onnx'}};
}

export async function loadReplayCases(manifestPath) {
  const resolved=path.resolve(manifestPath);
  const data=JSON.parse(await readFile(resolved,'utf8'));
  if (!Array.isArray(data.cases)||data.cases.length===0) throw new Error('Manifest requires non-empty cases');
  const cases=[];
  for (const item of data.cases) {
    if (!item||typeof item.name!=='string'||!item.name.trim()||
        !Number.isSafeInteger(item.expectedHelmetWearers)||item.expectedHelmetWearers<0||
        !Array.isArray(item.frames)||!item.frames.length) throw new Error('Invalid replay case');
    if (item.cameraId!==undefined&&(typeof item.cameraId!=='string'||!item.cameraId.trim()))
      throw new Error('Invalid cameraId');
    if (item.minConfidence!==undefined&&(!Number.isFinite(item.minConfidence)||item.minConfidence<0||item.minConfidence>1))
      throw new Error('Invalid minConfidence');
    let previous=-Infinity;
    const files=new Set(),frames=[];
    for (const sample of item.frames) {
      if (!sample||typeof sample.file!=='string'||!sample.file.trim()||typeof sample.capturedAt!=='string')
        throw new Error('Every frame requires a file and a real capturedAt timestamp');
      const timestamp=Date.parse(sample.capturedAt);
      if (!Number.isFinite(timestamp)||timestamp<=previous) throw new Error('Captures must have strictly increasing timestamps');
      previous=timestamp;
      const file=path.resolve(path.dirname(resolved),sample.file);
      if (files.has(file)) throw new Error('Do not replay one file as multiple fresh captures');
      files.add(file); await access(file);
      frames.push({...sample,file});
    }
    cases.push({...item,frames});
  }
  if (!cases.some(item=>item.expectedHelmetWearers>0)||!cases.some(item=>item.expectedHelmetWearers===0))
    throw new Error('Validation requires both labelled helmet-positive and negative cases');
  return cases;
}

export function evaluateReplayCase(item,observations) {
  if (!observations.length) throw new Error('No frames were evaluated');
  const alerts=observations.flatMap(sample=>sample.results.filter(result=>result.detectionType==='helmet-worn'&&result.requiresAlert));
  const wearerCounts=alerts.map(result=>{
    const count=result.metadata?.compliantCount;
    if (!Number.isSafeInteger(count)||count<1) throw new Error('Helmet result has no valid wearer count');
    return count;
  });
  const maxHelmetWearers=Math.max(0,...wearerCounts);
  const minimumConfidence=alerts.length ? Math.min(...alerts.map(result=>result.confidence??0)) : null;
  return {name:item.name,expectedHelmetWearers:item.expectedHelmetWearers,maxHelmetWearers,minimumConfidence,
    passed:maxHelmetWearers===item.expectedHelmetWearers&&
      (item.expectedHelmetWearers===0||minimumConfidence>=(item.minConfidence??0)),frames:observations};
}

export async function openHelmetReplay() {
  const moduleUrl=name=>new URL(`../dist/analytics-engine/src/${name}.js`,import.meta.url);
  try { await access(fileURLToPath(moduleUrl('detectors/helmet-detector'))); }
  catch { throw new Error('Build first: npm.cmd run build --workspace @sentinel/analytics-engine (from the repository root)'); }
  const [{getModelManager},{loadObjectInference},{HelmetDetector}]=await Promise.all([
    import(moduleUrl('model-manager')),import(moduleUrl('inference/configured-model-inference')),
    import(moduleUrl('detectors/helmet-detector'))]);
  const config=helmetReplayConfiguration();
  const manager=getModelManager({modelsDirectory:path.resolve(process.env.MODELS_DIR||path.join(engineRoot,'models')),
    enableGPU:false,startCleanupTimer:false});
  let detector;
  try {
    await manager.initialize();
    const objects=await loadObjectInference('yolov8n',config.objectThreshold);
    const reset=async()=>{
      if(detector)await detector.cleanup();
      detector=new HelmetDetector(null,config.confidenceThreshold,null,config.fastAlert);
      await detector.initialize();
      if(detector.getHealth().status!=='healthy')throw new Error(detector.getHealth().details);
    };
    await reset();
    return {config,reset,health:()=>({helmet:detector.getHealth(),loadedModels:manager.getLoadedModels()}),
      run:async(frame)=>{
        frame.metadata={...frame.metadata,detections:await objects.run(frame)};
        const results=await detector.detect(frame);
        return {capturedAt:frame.timestamp.toISOString(),width:frame.width,height:frame.height,
          persons:frame.metadata.detections.filter(item=>item.label==='person'),results};
      },close:async()=>{try{await detector.cleanup();}finally{await manager.shutdown();}}};
  }catch(error){try{if(detector)await detector.cleanup();}finally{await manager.shutdown();}throw error;}
}
