import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validFaceVector } from '../../packages/contracts/src/face-match-policy.js';

export class FaceModelUnavailableError extends Error {
  constructor(){super('Face recognition models are unavailable. Use password sign-in and ask an administrator to configure the local face models.');}
}
export type VerifiedFaceEmbedding = { vector:number[];modelId:string;quality:number };

let runtime:Promise<Awaited<ReturnType<typeof loadRuntime>>>|undefined;
async function modelPath(env:string,filename:string) {
  const candidates=process.env[env]?[process.env[env]!]:[resolve('analytics-engine/models/face',filename),resolve('models/face',filename),resolve('/app/models/face',filename)];
  for(const path of candidates){try {await access(path);return path;}catch{}}
  throw new FaceModelUnavailableError();
}
async function loadRuntime(){
  try {
    const [detectorPath,recognizerPath]=await Promise.all([modelPath('FACE_DETECTOR_MODEL_PATH','face-detector.onnx'),modelPath('ARCFACE_MODEL_PATH','arcface_r100.onnx')]);
    const onnxPkg = 'onnxruntime-node';
    const cvPkg = '../../analytics-engine/src/inference/opencv-specialty-inference.js';
    const alignPkg = '../../analytics-engine/src/face/face-alignment.service.js';
    const embedPkg = '../../analytics-engine/src/face/face-embedding.service.js';
    const [{InferenceSession},{YuNetFaceInference},{FaceAlignmentService},{FaceEmbeddingService}]=await Promise.all([
      import(onnxPkg) as Promise<any>,
      import(cvPkg) as Promise<any>,
      import(alignPkg) as Promise<any>,
      import(embedPkg) as Promise<any>,
    ]);
    const [detectorBytes,recognizerBytes]=await Promise.all([readFile(detectorPath),readFile(recognizerPath)]);
    const modelId=`arcface-r100:${createHash('sha256').update(recognizerBytes).digest('hex')}:${createHash('sha256').update(detectorBytes).digest('hex')}:align-v2`;
    const detector=new YuNetFaceInference(await InferenceSession.create(detectorPath,{executionProviders:['cpu'],intraOpNumThreads:2}),.85);
    const recognizer=new FaceEmbeddingService({modelPath:recognizerPath,modelName:'arcface-r100',embeddingDimension:512});
    await recognizer.initialize();if(!recognizer.getHealth().available)throw new FaceModelUnavailableError();
    return {detector,recognizer,alignment:new FaceAlignmentService(),modelId};
  } catch {throw new FaceModelUnavailableError();}
}

/** One real detected face, aligned using five landmarks, then a normalized ArcFace embedding. */
export async function extractVerifiedFace(imageDataUrl:string):Promise<VerifiedFaceEmbedding>{
  const match=/^data:image\/(?:jpe?g|png|webp);base64,\s*([A-Za-z0-9+/=\s]+)$/i.exec(imageDataUrl);
  if(!match)throw new Error('Upload a JPEG, PNG or WEBP face portrait.');
  const bytes=Buffer.from(match[1]!.replace(/\s+/g,''),'base64');
  if(!bytes.length || bytes.length>2_000_000)throw new Error('Face portrait must be smaller than 2 MB.');
  const image=await sharp(bytes,{limitInputPixels:20_000_000}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  runtime ??= loadRuntime().catch(error=>{runtime=undefined;throw error;});
  const ready=await runtime;
  const frame={cameraId:'employee-enrollment',tenantId:'local',timestamp:new Date(),width:image.info.width,height:image.info.height,imageData:image.data};
  const faces=await ready.detector.run(frame);
  if(faces.length!==1)throw new Error(faces.length?'Use a portrait containing only one face.':'No clear face detected. Face the camera in good lighting.');
  const face=faces[0]!,box=face.boundingBox;
  if (face.confidence === null || !Number.isFinite(face.confidence)) throw new Error('Invalid face confidence');
  if(box.width*frame.width<80 || box.height*frame.height<80)throw new Error('Move closer to the camera so the face is clearly visible.');
  const landmarks=face.attributes?.landmarks as Array<{x:number;y:number}>|undefined;
  if(!landmarks || landmarks.length!==5 || landmarks.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)))throw new Error('Face landmarks could not be verified. Use a clear frontal portrait.');
  const [leftEye,rightEye,nose,leftMouth,rightMouth]=landmarks;
  const encoded=await sharp(image.data,{raw:{width:frame.width,height:frame.height,channels:3}}).png().toBuffer();
  const aligned=await ready.alignment.align(encoded,{boundingBox:box,confidence:face.confidence,landmarks:{leftEye:leftEye!,rightEye:rightEye!,nose:nose!,leftMouth:leftMouth!,rightMouth:rightMouth!}},frame.width,frame.height);
  const embedding=await ready.recognizer.extractEmbedding(aligned,face.confidence);
  const vector=Array.from(embedding.vector as ArrayLike<number>);
  if(!validFaceVector(vector))throw new Error('The face model returned an invalid embedding.');
  return {vector,modelId:ready.modelId,quality:face.confidence};
}
