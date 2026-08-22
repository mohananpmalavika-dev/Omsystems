"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FileClock } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { maintenanceApi } from "@/lib/api-client";

export default function AmcContractsListPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi
      .listAmcContracts()
      .then((res) => setContracts(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ModulePage
      eyebrow="Coverage & contracts"
      title="AMC contracts"
      description="Monitor annual maintenance coverage, renewal windows, provider commitments, and service cost."
      icon={FileClock}
      actionHref="/maintenance/amc/new"
      actionLabel="Create contract"
      count={contracts.length}
      countLabel="contracts"
      loading={loading}
      error={error}
      empty={contracts.length === 0}
      emptyTitle="No active contracts"
      emptyDescription="Add a maintenance agreement to track coverage periods, vendors, and renewal obligations."
    >
      <div className="module-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Contract</th>
            <th>Vendor</th>
            <th>Status</th>
            <th>Coverage period</th>
            <th>Contract value</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => (
            <tr key={contract.id}>
              <td><strong className="module-row-title">{contract.contractNumber}</strong></td>
              <td><span className="module-id">{contract.vendorId}</span></td>
              <td><ModuleStatus value={contract.status} /></td>
              <td>
                {contract.startDate ?? "-"} {contract.endDate ? `to ${contract.endDate}` : ""}
              </td>
              <td>{contract.cost ?? "Not specified"}</td>
              <td className="module-row-action">
                <Link href={`/maintenance/amc/${contract.id}`}>View details</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </ModulePage>
  );
}
