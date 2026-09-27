"use client";

import { InspectionDesk } from "@/components/inspection-desk";
import React, { useEffect, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { ModulePage } from "@/components/module-page";
import { privacyApi } from "@/lib/api-client";

export default function PrivacyPurposesPage() {
  const [purposes, setPurposes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void privacyApi.listPurposes()
      .then((res) => setPurposes(res.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ModulePage
      presentation="registry"
      eyebrow="Privacy governance"
      title="Processing purposes"
      description="Define, review, and govern the lawful purposes that authorize CCTV processing across the estate."
      icon={FileCheck2}
      actionHref="/maintenance/privacy/purposes/new"
      actionLabel="Add purpose"
      count={purposes.length}
      countLabel="purposes"
      loading={loading}
      error={error}
      empty={purposes.length === 0}
      emptyTitle="No processing purposes"
      emptyDescription="Add the first lawful purpose before assigning cameras to processing activities."
    >
      <InspectionDesk label="Processing purpose library" records={purposes.map(purpose => ({id:purpose.id,title:purpose.name,subtitle:purpose.lawfulBasis,status:purpose.active ? "active" : "inactive",description:purpose.description,fields:[{label:"Lawful basis",value:purpose.lawfulBasis || "Not recorded"},{label:"Risk level",value:purpose.riskLevel || "Unrated"},{label:"Data categories",value:Array.isArray(purpose.dataCategories) ? purpose.dataCategories.join(", ") || "Not recorded" : "Not recorded"},{label:"Available for use",value:purpose.active ? "Yes" : "No"}]}))} />
    </ModulePage>
  );
}
