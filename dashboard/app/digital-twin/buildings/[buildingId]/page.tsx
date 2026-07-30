"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
export default function LegacyBuildingTwinRoute(){const params=useParams<{buildingId:string}>();const router=useRouter();const[error,setError]=useState<string>();useEffect(()=>{const buildingId=typeof params?.buildingId==="string"?params.buildingId:"";if(!buildingId)return;void(async()=>{try{const response=await fetch(`/api/control/v1/digital-twin/buildings/${buildingId}`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.message??body.error);router.replace(`/digital-twin/branches/${body.building.branchId}`);}catch(reason){setError(reason instanceof Error?reason.message:"Building not found");}})();},[params,router]);return <div className="grid min-h-[60vh] place-items-center">{error?<p className="text-red-600">{error}</p>:<Loader2 className="animate-spin text-cyan-600" size={36}/>}</div>}
