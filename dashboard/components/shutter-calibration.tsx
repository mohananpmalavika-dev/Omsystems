"use client";

import {useEffect,useRef,useState} from "react";
import {shutterConfigSchema,shutterSignature,type ShutterConfig} from "../../packages/contracts/src/shutter";

export function ShutterCalibration({onChange}:{onChange:(value:ShutterConfig|undefined)=>void}) {
  const [closed,setClosed]=useState<File>();
  const [open,setOpen]=useState<File>();
  const [preview,setPreview]=useState("");
  const [region,setRegion]=useState<ShutterConfig["region"]>();
  const [error,setError]=useState("");
  const [ready,setReady]=useState(false);
  const drag=useRef<{x:number;y:number}|undefined>(undefined);
  const area=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!closed){setPreview("");return;}
    const url=URL.createObjectURL(closed);setPreview(url);
    return()=>URL.revokeObjectURL(url);
  },[closed]);
  useEffect(()=>{
    let active=true;onChange(undefined);setReady(false);setError("");
    if(!closed||!open||!region)return;
    void Promise.all([signature(closed,region),signature(open,region)]).then(([closedReference,openReference])=>{
      if(!active)return;
      const config=shutterConfigSchema.parse({region,closedReference,openReference});
      onChange(config);setReady(true);
    }).catch(error=>{if(active)setError(error instanceof Error?error.message:"Unable to read reference snapshots");});
    return()=>{active=false;};
  },[closed,open,region,onChange]);
  const position=(event:React.PointerEvent)=>{
    const bounds=area.current!.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),
      y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))};
  };
  return <fieldset className="analytics-form-grid"><legend>Shutter setup</legend>
    <p className="wide">Use snapshots from this camera with the shutter fully closed and fully open. Drag a box inside the shutter area; exclude the wall, floor, timestamp and video controls.</p>
    <label>Closed snapshot<input type="file" accept="image/jpeg,image/png" onChange={event=>{onChange(undefined);setRegion(undefined);setClosed(event.target.files?.[0]);}}/></label>
    <label>Open snapshot<input type="file" accept="image/jpeg,image/png" onChange={event=>{onChange(undefined);setOpen(event.target.files?.[0]);}}/></label>
    {preview&&<div className="wide" ref={area} style={{position:"relative",touchAction:"none",cursor:"crosshair"}}
      onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current=position(event);}}
      onPointerUp={event=>{if(!drag.current)return;const end=position(event),start=drag.current;drag.current=undefined;
        const width=Math.abs(start.x-end.x),height=Math.abs(start.y-end.y);
        if(width>.03&&height>.03){onChange(undefined);setRegion({x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width,height});}}}
      onPointerCancel={()=>{drag.current=undefined;}}>
      {/* Native image preserves the uploaded snapshot coordinates used for calibration. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Closed shutter: drag to select the monitored area" draggable={false} style={{display:"block",width:"100%"}}/>
      {region&&<div style={{position:"absolute",pointerEvents:"none",border:"2px solid #22d3ee",background:"rgba(34,211,238,.12)",
        left:`${region.x*100}%`,top:`${region.y*100}%`,width:`${region.width*100}%`,height:`${region.height*100}%`}}/>}
    </div>}
    <small className="wide">{ready?"References ready. Each confirmed opening and closing creates a separate alert.":"Select both snapshots and mark the shutter area before saving."}</small>
    {error&&<p role="alert" className="analytics-message error wide">{error}</p>}
  </fieldset>;
}

async function signature(file:File,region:ShutterConfig["region"]) {
  if(file.size>8_000_000)throw new Error("Reference snapshot must be smaller than 8 MB");
  const image=await createImageBitmap(file);
  try {
    if(image.width*image.height>16_000_000 || image.width*region.width<32 || image.height*region.height<32)
      throw new Error("Use a normal camera snapshot and a shutter area of at least 32 × 32 pixels");
    const canvas=document.createElement("canvas");canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext("2d");if(!context)throw new Error("Snapshot processing is unavailable");
    context.drawImage(image,0,0);
    return shutterSignature(context.getImageData(0,0,image.width,image.height).data,image.width,image.height,region,4);
  }finally{image.close();}
}
