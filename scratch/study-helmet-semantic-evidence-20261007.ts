import sharp from 'sharp';
import {InferenceSession,Tensor} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
const stage='tmp/helmet-clip-candidate-20261007';
const prompts=JSON.parse(await readFile(stage+'/prompts.json','utf8'));
const inputs=JSON.parse(await readFile('reports/kollam-localization-study-2026-10-07.json','utf8'));
const sessions=[];
const normalize=(a:number[])=>{const norm=Math.hypot(...a);return a.map(v=>v/norm);};
try {
 const text=await InferenceSession.create(stage+'/text_model_quantized.onnx',{executionProviders:['cpu'],intraOpNumThreads:2});sessions.push(text);
 console.log('TEXT_METADATA',JSON.stringify({inputs:text.inputMetadata,outputs:text.outputMetadata}));
 const feeds:any={};
 for(const name of text.inputNames)feeds[name]=new Tensor('int64',BigInt64Array.from(prompts.flatMap(p=>name==='attention_mask'?p.mask:p.ids),BigInt),[prompts.length,77]);
 const output=await text.run(feeds),embeddings=output.text_embeds??output[text.outputNames[0]];
 const dimensions=Number(embeddings.dims.at(-1));
 const vectors=prompts.map((p,i)=>({label:p.label,vector:normalize(Array.from((embeddings.data as Float32Array).slice(i*dimensions,(i+1)*dimensions)))}));
 const labels=[...new Set(vectors.map(v=>v.label))];
 const prototypes=labels.map(label=>{const grouped=vectors.filter(v=>v.label===label);return {label,vector:normalize(Array.from({length:dimensions},(_,i)=>grouped.reduce((sum,v)=>sum+v.vector[i],0)/grouped.length))};});
 await writeFile(stage+'/prototypes.json',JSON.stringify({dimensions,logitScale:100,prototypes,promptVectors:vectors},null,2));
 const vision=await InferenceSession.create(stage+'/vision_model_quantized.onnx',{executionProviders:['cpu'],intraOpNumThreads:2});sessions.push(vision);
 console.log('VISION_METADATA',JSON.stringify({inputs:vision.inputMetadata,outputs:vision.outputMetadata}));
 const rows=[];
 for(const item of inputs) {
  const {data,info}=await sharp(item.file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const heads=[];
  for(const head of item.full) {
   const scores=[];
   for(const p of [0,.15]) {
    const b=head.boundingBox;
    const left=Math.max(0,Math.floor((b.x-b.width*p)*info.width)),top=Math.max(0,Math.floor((b.y-b.height*p)*info.height));
    const right=Math.min(info.width,Math.ceil((b.x+b.width*(1+p))*info.width)),bottom=Math.min(info.height,Math.ceil((b.y+b.height*(1+p))*info.height));
    const pixels=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}})
     .extract({left,top,width:right-left,height:bottom-top}).resize(224,224,{fit:'cover',position:'centre',kernel:'cubic'}).raw().toBuffer();
    const chw=new Float32Array(3*224*224),mean=[.48145466,.4578275,.40821073],std=[.26862954,.26130258,.27577711];
    for(let i=0;i<224*224;i++)for(let c=0;c<3;c++)chw[c*224*224+i]=(pixels[i*3+c]/255-mean[c])/std[c];
    const started=performance.now();
    const result=await vision.run({pixel_values:new Tensor('float32',chw,[1,3,224,224])});
    const embed=normalize(Array.from((result.image_embeds??result[vision.outputNames[0]]).data as Float32Array));
    const values=labels.map(label=>{
     const group=vectors.filter(v=>v.label===label).map(p=>p.vector.reduce((sum,v,i)=>sum+v*embed[i],0));
     const m=Math.max(...group);return m+Math.log(group.reduce((sum,v)=>sum+Math.exp((v-m)*100),0)/group.length)/100;
    });
    const maximum=Math.max(...values),exp=values.map(v=>Math.exp((v-maximum)*100)),den=exp.reduce((sum,v)=>sum+v,0);
    scores.push({probabilities:Object.fromEntries(labels.map((l,i)=>[l,exp[i]/den])),similarities:Object.fromEntries(labels.map((l,i)=>[l,values[i]])),milliseconds:performance.now()-started});
   }
   heads.push({head,scores});
  }
  const row={file:item.file,heads};rows.push(row);console.log(JSON.stringify(row));
 }
 await writeFile('reports/helmet-semantic-evidence-study-2026-10-07.json',JSON.stringify(rows,null,2));
}finally{for(const s of sessions)await s.release();}
process.exit(0);
