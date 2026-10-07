import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference} from '../analytics-engine/src/inference/configured-model-inference.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const originals=JSON.parse(await readFile('reports/helmet-permanent-regression-originals-2026-10-07.json','utf8')).samples;
const samples=[
 {file:'scratch/helmet-alert-ch6.jpg',expectedHelmet:true,split:'train',group:'pilot-pink'},
 {file:'tmp/helmet-channel-6.jpg',expectedHelmet:true,split:'train',group:'pilot-blue'},
 {file:'tmp/pilot-wearer-a85e6b3f-89c4-40b9-a51d-cab4499ddb7c-639269109585900000-20261007.jpg',expectedHelmet:true,split:'train',group:'pilot-pink'},
 {file:'tmp/pilot-wearer-99965e01-8fb4-44e3-8b9f-615ec673274d-639269109527830000-20261007.jpg',expectedHelmet:true,split:'train',group:'pilot-pink'},
 {file:'scratch/helmet-false-f5781a86-8527-4a30-a94a-3f256555fbcb.jpg',expectedHelmet:false,split:'train',group:'hajipur'},
 {file:'scratch/helmet-new-false-alert-raw.jpg',expectedHelmet:false,split:'train',group:'older-false'},
 {file:'tmp/helmet-channel-7.jpg',expectedHelmet:false,split:'train',group:'pilot-bare'},
 {file:'scratch/helmet-rajkot-original-0.jpg',expectedHelmet:false,split:'train',group:'rajkot'},
 {file:'tmp/kollam-live-fb465a8f-5d79-4a3f-9cb8-b8cec471708d-20261007102517107.jpg',expectedHelmet:true,split:'test',group:'kollam'},
 {file:'tmp/kollam-live-fb465a8f-5d79-4a3f-9cb8-b8cec471708d-20261007102525317.jpg',expectedHelmet:true,split:'test',group:'kollam'},
 {file:'scratch/helmet-false-f0b4f55e-00c0-442c-a0e1-3d6a05150bdf.jpg',expectedHelmet:false,split:'test',group:'hajipur-held-frame'},
 {file:'scratch/helmet-rajkot-original-1.jpg',expectedHelmet:false,split:'test',group:'rajkot-held-frame'},
 {file:'scratch/helmet-rajkot-original-2.jpg',expectedHelmet:false,split:'test',group:'rajkot-held-frame'},
 ...originals.map(s=>({...s,split:'test',group:'recovered-'+s.eventId})),
];
const rows=[];
try {
 const localizer=await loadObjectInference('helmet-head-localizer',.25),objects=await loadObjectInference('yolov8n',.35);
 for(const item of samples) {
  const {data,info}=await sharp(item.file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:item.file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
  const persons=(await objects.run(frame)).filter(o=>o.label==='person'),allHeads=await localizer.run(frame);
  // Keep full source heads; labels do not establish helmet ground truth.
  const heads=allHeads.filter(h=>h.boundingBox.width*info.width>=20&&h.boundingBox.height*info.height>=20);
  const row={...item,width:info.width,height:info.height,persons,heads};rows.push(row);
  console.log(JSON.stringify({file:item.file,split:item.split,expectedHelmet:item.expectedHelmet,persons:persons.length,heads:heads.length}));
 }
 await writeFile('reports/helmet-semantic-benchmark-inputs-2026-10-07.json',JSON.stringify(rows,null,2));
}finally{await manager.shutdown();}
process.exit(0);
