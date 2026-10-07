import sharp from 'sharp';
import {InferenceSession,Tensor} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
const inputFile=process.argv[2]??'reports/helmet-semantic-benchmark-inputs-2026-10-07.json';
const outputFile=process.argv[3]??'reports/helmet-semantic-features-2026-10-07.json';
const inputs=JSON.parse(await readFile(inputFile,'utf8'));
if(!process.argv[2])inputs.push({file:'tmp/helmet-negative-paddle.png',expectedHelmet:false,split:'train',group:'hat-control',
 heads:[{label:'head',confidence:1,boundingBox:{x:.25,y:.15,width:.45,height:.7}}]});
const model=await InferenceSession.create('tmp/helmet-clip-candidate-20261007/vision_model_quantized.onnx',
 {executionProviders:['cpu'],intraOpNumThreads:2});
const rows=[];
try {
 for(const item of inputs) {
  const decoded=item.file.endsWith('.rgb')?{data:await readFile(item.file),info:{width:item.width,height:item.height}}:
   await sharp(item.file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const {data,info}=decoded;
  for(const [index,head] of item.heads.entries()) {
   const b=head.boundingBox;
   for(const padding of item.split==='train'?[0,.1,.2]:[0,.15]) {
    const left=Math.max(0,Math.floor((b.x-b.width*padding)*info.width));
    const top=Math.max(0,Math.floor((b.y-b.height*padding)*info.height));
    const right=Math.min(info.width,Math.ceil((b.x+b.width*(1+padding))*info.width));
    const bottom=Math.min(info.height,Math.ceil((b.y+b.height*(1+padding))*info.height));
    const pixels=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}})
     .extract({left,top,width:right-left,height:bottom-top}).resize(224,224,{fit:'cover',position:'centre',kernel:'cubic'}).raw().toBuffer();
    const chw=new Float32Array(3*224*224),mean=[.48145466,.4578275,.40821073],std=[.26862954,.26130258,.27577711];
    for(let i=0;i<224*224;i++)for(let c=0;c<3;c++)chw[c*224*224+i]=(pixels[i*3+c]/255-mean[c])/std[c];
    const output=await model.run({pixel_values:new Tensor('float32',chw,[1,3,224,224])});
    const feature=Array.from(output.image_embeds.data as Float32Array),norm=Math.hypot(...feature);
    rows.push({file:item.file,group:item.group,split:item.split,expectedHelmet:'expectedHelmet' in head?head.expectedHelmet:item.expectedHelmet,
     headIndex:index,head:head.boundingBox,padding,feature:feature.map(v=>v/norm)});
   }
  }
  console.log(JSON.stringify({file:item.file,split:item.split,heads:item.heads.length,features:rows.length}));
 }
 await writeFile(outputFile,JSON.stringify(rows));
}finally{await model.release();}
process.exit(0);
