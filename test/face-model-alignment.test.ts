import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FaceAlignmentService } from '../analytics-engine/src/face/face-alignment.service.js';
import { extractVerifiedFace } from '../src/security/face-embedding-provider.js';

const canonical = [[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
const names = ['leftEye','rightEye','nose','leftMouth','rightMouth'];

describe('face alignment geometry', () => {
  it('preserves canonical pixels under translation, rotation and scaling', async () => {
    const service = new FaceAlignmentService();
    const width=320, height=320, pixels=Buffer.alloc(width*height*3);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const offset=(y*width+x)*3;
      pixels[offset]=Math.round(x/2);pixels[offset+1]=Math.round(y/2);pixels[offset+2]=80;
    }
    const image=await sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
    const angle=.2, scale=1.5, tx=75, ty=45;
    const source=(x:number,y:number)=>({x:scale*(Math.cos(angle)*x-Math.sin(angle)*y)+tx,y:scale*(Math.sin(angle)*x+Math.cos(angle)*y)+ty});
    const landmarks=Object.fromEntries(canonical.map(([x,y],index)=>{
      const point=source(x!,y!);return [names[index],{x:point.x/width,y:point.y/height}];
    }));
    const aligned=await service.align(image,{confidence:.99,boundingBox:{x:0,y:0,width:1,height:1},landmarks} as never,width,height);
    const point=source(56,70), offset=70*112+56;
    expect(Math.abs((aligned[offset]!+1)*127.5-point.x/2)).toBeLessThan(1);
    expect(Math.abs((aligned[112*112+offset]!+1)*127.5-point.y/2)).toBeLessThan(1);
    expect(aligned).toHaveLength(112*112*3);
  });

  it('rejects coincident landmarks instead of falling back to an unrelated crop', async () => {
    const image=await sharp({create:{width:112,height:112,channels:3,background:'white'}}).png().toBuffer();
    const landmarks=Object.fromEntries(names.map(name=>[name,{x:.5,y:.5}]));
    await expect(new FaceAlignmentService().align(image,{landmarks} as never,112,112)).rejects.toThrow('degenerate');
  });

  it.skipIf(!existsSync(process.env.FACE_DETECTOR_MODEL_PATH ?? 'analytics-engine/models/face/face-detector.onnx') ||
    !existsSync(process.env.ARCFACE_MODEL_PATH ?? 'analytics-engine/models/face/arcface_r100.onnx'))('rejects blank images using the installed ONNX models', async () => {
    const image=await sharp({create:{width:640,height:640,channels:3,background:'white'}}).png().toBuffer();
    await expect(extractVerifiedFace(`data:image/png;base64,${image.toString('base64')}`)).rejects.toThrow('No clear face detected');
  },60000);
});
