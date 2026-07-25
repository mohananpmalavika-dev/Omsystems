"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Handshake } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { maintenanceApi } from "@/lib/api-client";

export default function VendorsListPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void maintenanceApi.listVendors().then((r) => setVendors(r.data)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, []);

  return (
    <ModulePage
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
      <div className="module-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Vendor ID</th>
            <th>Partner</th>
            <th>Primary contact</th>
            <th>Phone</th>
            <th>Status</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id}>
              <td><span className="module-id">{v.id}</span></td>
              <td><strong className="module-row-title">{v.name}</strong></td>
              <td>{v.contactName ?? 'Not assigned'}</td>
              <td>{v.phone ?? 'Not provided'}</td>
              <td><ModuleStatus value={v.active ? 'Active' : 'Inactive'} /></td>
              <td className="module-row-action">
                <Link href={`/maintenance/vendors/${v.id}`}>View details</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </ModulePage>
  );
}
