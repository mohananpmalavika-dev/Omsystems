import sharp from 'sharp';
import {InferenceSession} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
import {YoloDetectionInference} from '../analytics-engine/src/inference/yolo-detection-inference.js';
const inputs=JSON.parse(await readFile('reports/kollam-localization-study-2026-10-07.json','utf8'));
const rows=[];
for(const [file,labels,decoder,size] of [
 ['tmp/helmet-localizer-candidates/v2-helmetv2_int8.onnx',['helmet','bare-head'],'yolov5',320],
 ['tmp/helmet-localizer-candidates/pooja-best.onnx',['bike','helmet','plate','bare-head'],'xyxy',640],
 ['tmp/helmet-localizer-candidates/traffic-stage2.onnx',['helmet','bare-head','plate'],'xyxy',320],
] as const) {
 const session=await InferenceSession.create(file,{executionProviders:['cpu'],intraOpNumThreads:2});
 try {
  const inference=new YoloDetectionInference(session,{labels,decoder,inputWidth:size,inputHeight:size,
   confidenceThreshold:.25,preprocessor:'rgb-normalized-letterbox'});
  for(const item of inputs) {
   const {data,info}=await sharp(item.file).removeAlpha().raw().toBuffer({resolveWithObject:true});
   const frame={cameraId:item.file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
   const full=await inference.run(frame),crops=[];
   for(const head of item.full) {
    const b=head.boundingBox,p=.4;
    const left=Math.max(0,Math.floor((b.x-b.width*p)*info.width)),top=Math.max(0,Math.floor((b.y-b.height*p)*info.height));
    const right=Math.min(info.width,Math.ceil((b.x+b.width*(1+p))*info.width)),bottom=Math.min(info.height,Math.ceil((b.y+b.height*(1+p))*info.height));
    const crop=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).extract({left,top,width:right-left,height:bottom-top}).raw().toBuffer();
    crops.push({head,detections:await inference.run({...frame,imageData:crop,width:right-left,height:bottom-top})});
   }
   const row={model:file,file:item.file,full,crops};rows.push(row);console.log(JSON.stringify(row));
  }
 }finally{await session.release();}
}
await writeFile('reports/kollam-alternate-localizers-2026-10-07.json',JSON.stringify(rows,null,2));
process.exit(0);
