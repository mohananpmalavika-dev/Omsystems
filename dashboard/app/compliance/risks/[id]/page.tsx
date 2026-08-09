"use client";

import { useParams } from "next/navigation";
import { ComplianceRecordDetail } from "@/components/compliance/compliance-record-detail";

export default function RiskDetailPage() {
  const params = useParams<{ id: string }>();
  return <ComplianceRecordDetail kind="risks" id={params?.id ?? ""} />;
}
