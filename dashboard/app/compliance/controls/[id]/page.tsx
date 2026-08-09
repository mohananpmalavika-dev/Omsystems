"use client";

import { useParams } from "next/navigation";
import { ComplianceRecordDetail } from "@/components/compliance/compliance-record-detail";

export default function ControlDetailPage() {
  const params = useParams<{ id: string }>();
  return <ComplianceRecordDetail kind="controls" id={params?.id ?? ""} />;
}
