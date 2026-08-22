"use client";

import React, { useEffect, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
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
      <div className="module-table-wrap">
        <table>
          <thead><tr><th>Purpose</th><th>Lawful basis</th><th>Risk</th><th>Status</th><th>Description</th></tr></thead>
          <tbody>{purposes.map((purpose) => (
            <tr key={purpose.id}>
              <td><strong className="module-row-title">{purpose.name}</strong></td>
              <td><span className="module-category">{purpose.lawfulBasis}</span></td>
              <td><span className={`module-priority ${(purpose.riskLevel || "").toLowerCase()}`}>{purpose.riskLevel || "Unrated"}</span></td>
              <td><ModuleStatus value={purpose.active ? "Active" : "Inactive"} /></td>
              <td>{purpose.description || "No description provided"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </ModulePage>
  );
}
