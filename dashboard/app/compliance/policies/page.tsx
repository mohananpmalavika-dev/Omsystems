"use client";

import React, { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { ModulePage } from "@/components/module-page";
import { complianceApi } from "@/lib/api-client";
import type { CompliancePolicy } from "@/lib/types";

export default function CompliancePoliciesPage() {
  const [policies, setPolicies] = useState<CompliancePolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadPolicies() {
    setLoading(true);
    setError(null);
    void complianceApi.listPolicies().then((res) => {
      setPolicies(res.data as CompliancePolicy[]);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load policies");
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPolicies();
  }, []);

  return (
    <ModulePage
      eyebrow="Governance controls"
      title="Compliance policies"
      description="Define how regulatory frameworks apply to camera coverage, data retention, access, and operating locations."
      icon={ScrollText}
      count={policies.length}
      countLabel="policies"
      loading={loading}
      error={error}
      onRetry={loadPolicies}
      empty={policies.length === 0}
      emptyTitle="No compliance policies"
      emptyDescription="Policies created for retention, privacy, access, and evidence handling will appear in this repository."
    >
      <div className="module-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Policy name</th>
              <th>Framework</th>
              <th>Retention</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td><strong className="module-row-title">{policy.policyName}</strong></td>
                <td><span className="module-id">{policy.frameworkId}</span></td>
                <td>{policy.normalRetentionDays ?? "—"} days</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}
