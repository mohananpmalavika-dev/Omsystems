"use client";
import { useParams } from "next/navigation";
import OperationalTwin from "@/components/digital-twin/operational-twin";
export default function BranchTwinEditorPage(){const params=useParams<{branchId:string}>();const branchId=typeof params?.branchId==="string"?params.branchId:"";return branchId?<OperationalTwin branchId={branchId} editor/>:null;}
