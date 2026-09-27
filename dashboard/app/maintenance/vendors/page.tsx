"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Handshake } from "lucide-react";
import { ModulePage } from "@/components/module-page";
import { RecordBrowser } from "@/components/record-browser";
import { WorkflowNav } from "@/components/workflow-nav";
import { maintenanceApi } from "@/lib/api-client";

export default function VendorsListPage() {
  const [view, setView] = useState("browse");
  const [query, setQuery] = useState("");
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listVendors().then((r) => setVendors(r.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, []);

  return (
    <ModulePage
      presentation="registry"
      eyebrow="Service network"
      title="Vendors & partners"
      description="Manage approved service providers, escalation contacts, and maintenance partners from one directory."
      icon={Handshake}
      actionHref="/maintenance/vendors/new"
      actionLabel="Add vendor"
      count={vendors.length}
      countLabel="vendors"
      loading={loading}
      error={error}
      empty={vendors.length === 0}
      emptyTitle="No vendors onboarded"
      emptyDescription="Add an approved partner to coordinate field support and equipment servicing."
    >
      <div className="asset-registry-workspace">
      <div className="service-board-toolbar"><WorkflowNav label="Vendor directory view" value={view} onChange={setView} items={[{id:"browse",label:"Partner directory"},{id:"table",label:"Record view"}]} /><input className="input" aria-label="Search service partners" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a partner or contact"/></div>
      <section hidden={view!=="browse"}><RecordBrowser icon={Handshake} label="Service partners" records={vendors.filter(v=>`${v.name} ${v.contact??""} ${v.phone??""} ${v.email??""}`.toLowerCase().includes(query.trim().toLowerCase())).map(v=>({id:v.id,title:v.name,subtitle:v.contact||"Contact not assigned",href:`/maintenance/vendors/${v.id}`,fields:[{label:"Primary contact",value:v.contact},{label:"Phone",value:v.phone},{label:"Email",value:v.email}]}))}/></section>
      <div hidden={view!=="table"} className="module-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Vendor ID</th>
            <th>Partner</th>
            <th>Primary contact</th>
            <th>Phone</th>
            <th>Email</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {vendors.filter(v=>`${v.name} ${v.contact??""} ${v.phone??""} ${v.email??""}`.toLowerCase().includes(query.trim().toLowerCase())).map((v) => (
            <tr key={v.id}>
              <td><span className="module-id">{v.id}</span></td>
              <td><strong className="module-row-title">{v.name}</strong></td>
              <td>{v.contact ?? 'Not assigned'}</td>
              <td>{v.phone ?? 'Not provided'}</td>
              <td>{v.email ?? 'Not provided'}</td>
              <td className="module-row-action">
                <Link href={`/maintenance/vendors/${v.id}`}>View details</Link>
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
