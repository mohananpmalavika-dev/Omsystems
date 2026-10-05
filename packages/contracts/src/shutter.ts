import { z } from "zod";

export const SHUTTER_GRID = 32;
const referenceSchema = z.array(z.number().finite().min(0).max(255)).length(SHUTTER_GRID * SHUTTER_GRID);
export const shutterConfigSchema = z.object({
  region: z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),
    width:z.number().positive().max(1),height:z.number().positive().max(1)})
    .refine(box=>box.x+box.width<=1 && box.y+box.height<=1,"Shutter area must stay inside the frame"),
  openReference: referenceSchema,
  closedReference: referenceSchema,
}).superRefine((config,context)=>{
  if (Math.min(contrast(config.openReference),contrast(config.closedReference))<6)
    context.addIssue({code:"custom",message:"References need a clear, textured shutter area"});
  // Even an exact reference must clear the detector's 0.12 separation margin.
  if (referenceSimilarity(config.openReference,config.closedReference)>.88)
    context.addIssue({code:"custom",message:"Open and closed reference views are too similar"});
});
export interface ShutterConfig {
  region: {x:number;y:number;width:number;height:number};
  openReference:number[];
  closedReference:number[];
}

/** RGB/RGBA input; identical sampling in browser calibration and frame inference. */
export function shutterSignature(pixels: ArrayLike<number>,width:number,height:number,
  region:ShutterConfig["region"],channels=3):number[] {
  if (![width,height].every(value=>Number.isSafeInteger(value)&&value>0) || pixels.length!==width*height*channels)
    throw new Error("Invalid shutter frame pixels");
  const values:number[]=[];
  for(let y=0;y<SHUTTER_GRID;y++)for(let x=0;x<SHUTTER_GRID;x++) {
    const px=Math.min(width-1,Math.floor((region.x+(x+.5)/SHUTTER_GRID*region.width)*width));
    const py=Math.min(height-1,Math.floor((region.y+(y+.5)/SHUTTER_GRID*region.height)*height));
    const offset=(py*width+px)*channels;
    values.push(.299*pixels[offset]!+.587*pixels[offset+1]!+.114*pixels[offset+2]!);
  }
  return values;
}
export function contrast(values:readonly number[]) {
  const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
  return Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length);
}
/** Correlation tolerates uniform brightness/exposure changes; not a model probability. */
export function referenceSimilarity(a:readonly number[],b:readonly number[]) {
  if(a.length!==b.length || !a.length)return 0;
  const am=a.reduce((sum,value)=>sum+value,0)/a.length,bm=b.reduce((sum,value)=>sum+value,0)/b.length;
  let product=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){const av=a[i]!-am,bv=b[i]!-bm;product+=av*bv;aa+=av*av;bb+=bv*bv;}
  return aa<1 || bb<1?0:Math.max(0,Math.min(1,(product/Math.sqrt(aa*bb)+1)/2));
}
