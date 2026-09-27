"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FileClock } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { RecordBrowser } from "@/components/record-browser";
import { WorkflowNav } from "@/components/workflow-nav";
import { maintenanceApi } from "@/lib/api-client";
import type { MaintenanceVendor } from "@/lib/types";

export default function AmcContractsListPage() {
  const [view, setView] = useState("browse");
  const [query, setQuery] = useState("");
  const [contracts, setContracts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<MaintenanceVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi
      .listAmcContracts()
      .then(async (res) => {
        setContracts(res.data);
        const directory = await maintenanceApi.listVendors();
        setVendors(directory.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ModulePage
      presentation="registry"
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
      <div className="asset-registry-workspace">
      <div className="service-board-toolbar"><WorkflowNav label="Contract workspace view" value={view} onChange={setView} items={[{id:"browse",label:"Coverage explorer"},{id:"table",label:"Record view"}]} /><input className="input" aria-label="Search coverage contracts" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a contract or service provider"/></div>
      <section hidden={view!=="browse"}><RecordBrowser icon={FileClock} label="Maintenance agreements" records={contracts.filter(c=>`${c.contractNumber} ${vendors.find(v=>v.id===c.vendorId)?.name??""}`.toLowerCase().includes(query.trim().toLowerCase())).map(c=>({id:c.id,title:c.contractNumber,subtitle:vendors.find(v=>v.id===c.vendorId)?.name||"Directory record unavailable",status:c.status,href:`/maintenance/amc/${c.id}`,fields:[{label:"Coverage begins",value:c.startDate},{label:"Coverage ends",value:c.endDate},{label:"Contract value",value:c.cost!=null?String(c.cost):undefined},{label:"Vendor",value:vendors.find(v=>v.id===c.vendorId)?.name||c.vendorId}]}))}/></section>
      <div hidden={view!=="table"} className="module-table-wrap">
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
          {contracts.filter(c=>`${c.contractNumber} ${vendors.find(v=>v.id===c.vendorId)?.name??""}`.toLowerCase().includes(query.trim().toLowerCase())).map((contract) => (
            <tr key={contract.id}>
              <td><strong className="module-row-title">{contract.contractNumber}</strong></td>
              <td>{vendors.find((vendor) => vendor.id === contract.vendorId)?.name ?? "Directory record unavailable"}</td>
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
      </div>
    </ModulePage>
  );
}
