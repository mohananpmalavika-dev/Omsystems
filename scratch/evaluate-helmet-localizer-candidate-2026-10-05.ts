import sharp from 'sharp';
import {InferenceSession} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
import {YoloDetectionInference} from '../analytics-engine/src/inference/yolo-detection-inference.js';
const file=process.argv[2]??'tmp/helmet-localizer-candidates/pooja-best.onnx';
const session=await InferenceSession.create(file,{executionProviders:['cpu'],intraOpNumThreads:2});
console.log(JSON.stringify({inputs:session.inputMetadata,outputs:session.outputMetadata}));
const traffic=file.includes('traffic');
const v2=file.includes('v2-');
const size=traffic||v2?320:640;
const inference=new YoloDetectionInference(session,{labels:v2?['helmet','bare-head']:traffic?['helmet','bare-head','plate']:['bike','helmet','plate','bare-head'],decoder:v2?'yolov5':'xyxy',inputWidth:size,inputHeight:size,confidenceThreshold:.1});
const previous=JSON.parse(await readFile('reports/helmet-batch-false-alarms-2026-10-05-study.json','utf8'));
const files=[...previous.map(row=>row.file),'C:/Users/Dhanya/Downloads/incident-snapshot-1791202017341.jpg',...['1791204590121','1791204562457','1791204377566'].map(id=>`C:/Users/Dhanya/Downloads/incident-snapshot-${id}.jpg`)];
const results=[];
for(const file of files) {
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
 const resized=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).resize(size,size,{fit:'contain',background:{r:114,g:114,b:114}}).raw().toBuffer();
 const detected=await inference.run({...frame,imageData:resized,width:size,height:size});
 results.push({file,detections:detected});
 console.log(JSON.stringify(results.at(-1)));
}
await writeFile(`reports/helmet-localizer-${v2?'v2-':traffic?'traffic-':''}candidate-evaluation-2026-10-05.json`,JSON.stringify(results,null,2));
await session.release();
process.exit(0);
