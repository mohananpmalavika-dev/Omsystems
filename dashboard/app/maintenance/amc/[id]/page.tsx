"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function AmcContractDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [contracts, setVendors] = useState<any[]>([]);
  const [contract, setContract] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void Promise.all([maintenanceApi.getAmcContract(id), maintenanceApi.listVendors()])
      .then(([contractRes, vendorsRes]) => {
        setContract(contractRes);
        setVendors(vendorsRes.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!contract) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        contractNumber: contract.contractNumber,
        vendorId: contract.vendorId,
        startDate: contract.startDate || undefined,
        endDate: contract.endDate || undefined,
        warranty: contract.warranty || undefined,
        coverage: contract.coverage || undefined,
        exclusions: contract.exclusions || undefined,
        paymentTerms: contract.paymentTerms || undefined,
        cost: contract.cost === "" || contract.cost === undefined ? undefined : Number(contract.cost),
        renewal: contract.renewal || undefined,
        sla: contract.sla || undefined,
        status: contract.status,
        notes: contract.notes || undefined,
      };
      await maintenanceApi.updateAmcContract(id, payload);
      router.push("/maintenance/amc");
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!contract) return <div style={{ padding: 16 }}>AMC contract not found</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>AMC contract {contract.id}</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/maintenance/amc">Back to AMC contracts</Link>
      </div>
      <form onSubmit={handleSave} style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Contract number<br />
            <input value={contract.contractNumber ?? ""} onChange={(e) => setContract({ ...contract, contractNumber: e.target.value })} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Vendor<br />
            <select value={contract.vendorId ?? ""} onChange={(e) => setContract({ ...contract, vendorId: e.target.value })} required>
              <option value="">Select vendor</option>
              {contracts.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <label>
              Start date<br />
              <input type="date" value={contract.startDate ?? ""} onChange={(e) => setContract({ ...contract, startDate: e.target.value })} />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              End date<br />
              <input type="date" value={contract.endDate ?? ""} onChange={(e) => setContract({ ...contract, endDate: e.target.value })} />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              Status<br />
              <select value={contract.status ?? "active"} onChange={(e) => setContract({ ...contract, status: e.target.value })}>
                <option value="active">active</option>
                <option value="pending">pending</option>
                <option value="expired">expired</option>
                <option value="suspended">suspended</option>
              </select>
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              Cost<br />
              <input type="number" step="0.01" value={contract.cost ?? ""} onChange={(e) => setContract({ ...contract, cost: e.target.value })} />
            </label>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Warranty<br />
            <input value={contract.warranty ?? ""} onChange={(e) => setContract({ ...contract, warranty: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Coverage<br />
            <textarea rows={3} value={contract.coverage ?? ""} onChange={(e) => setContract({ ...contract, coverage: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Exclusions<br />
            <textarea rows={3} value={contract.exclusions ?? ""} onChange={(e) => setContract({ ...contract, exclusions: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Payment terms<br />
            <input value={contract.paymentTerms ?? ""} onChange={(e) => setContract({ ...contract, paymentTerms: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Renewal<br />
            <input value={contract.renewal ?? ""} onChange={(e) => setContract({ ...contract, renewal: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            SLA<br />
            <input value={contract.sla ?? ""} onChange={(e) => setContract({ ...contract, sla: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>
            Notes<br />
            <textarea rows={4} value={contract.notes ?? ""} onChange={(e) => setContract({ ...contract, notes: e.target.value })} />
          </label>
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
}
