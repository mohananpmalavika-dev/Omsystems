"use client";

import { useParams } from "next/navigation";
import { ComplianceRecordDetail } from "@/components/compliance/compliance-record-detail";

export default function RequirementDetailPage() {
  const params = useParams<{ id: string }>();
  return <ComplianceRecordDetail kind="requirements" id={params?.id ?? ""} />;
}
