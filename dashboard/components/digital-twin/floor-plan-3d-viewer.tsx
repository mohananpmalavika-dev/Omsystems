"use client";
/** Progressive CSS extrusion used when a full glTF/BIM asset is unavailable. */
export default function FloorPlan3DViewer({children,mode}:{children?:React.ReactNode;mode:"2d"|"2.5d"|"3d"}){const transform=mode==="2d"?"none":mode==="2.5d"?"perspective(1100px) rotateX(42deg) rotateZ(-2deg) scale(.9)":"perspective(900px) rotateX(58deg) rotateZ(-8deg) scale(.82)";return <div className="h-full w-full origin-center transition-transform duration-500" style={{transform}}>{children}</div>}
