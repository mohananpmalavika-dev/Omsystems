"use client";

import React, { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { privacyApi } from "@/lib/api-client";

export default function PrivacyBreachesPage() {
  const [breaches, setBreaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void privacyApi.listBreaches()
      .then((res) => setBreaches(res.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ModulePage
      eyebrow="Privacy incident response"
      title="Privacy breach register"
      description="Review reported privacy events, track investigation status, and maintain a governed response history."
      icon={ShieldAlert}
      actionHref="/maintenance/privacy/breaches/new"
      actionLabel="Report breach"
      count={breaches.length}
      countLabel="breaches"
      loading={loading}
      error={error}
      empty={breaches.length === 0}
      emptyTitle="No privacy breaches reported"
      emptyDescription="New privacy events will appear here for triage, investigation, notification, and closure."
    >
      <div className="module-table-wrap">
        <table>
          <thead><tr><th>Event type</th><th>Severity</th><th>Status</th><th>Description</th></tr></thead>
          <tbody>{breaches.map((breach) => (
            <tr key={breach.id}>
              <td><strong className="module-row-title">{breach.breachType.replace(/_/g, " ")}</strong></td>
              <td><span className={`module-priority ${(breach.severity || "").toLowerCase()}`}>{breach.severity || "Unrated"}</span></td>
              <td><ModuleStatus value={breach.status} /></td>
              <td>{breach.description || "No description provided"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </ModulePage>
  );
}
