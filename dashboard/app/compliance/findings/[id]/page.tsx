"use client";

import { useParams } from "next/navigation";
import { ComplianceRecordDetail } from "@/components/compliance/compliance-record-detail";

export default function FindingDetailPage() {
  const params = useParams<{ id: string }>();
  return <ComplianceRecordDetail kind="findings" id={params?.id ?? ""} />;
}
