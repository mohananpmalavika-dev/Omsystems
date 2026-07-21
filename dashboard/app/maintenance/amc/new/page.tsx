"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api-client";

export default function NewAmcContractPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<any[]>([]);
  const [contractNumber, setContractNumber] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [warranty, setWarranty] = useState("");
  const [coverage, setCoverage] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [cost, setCost] = useState("");
  const [renewal, setRenewal] = useState("");
  const [sla, setSla] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void maintenanceApi.listVendors().then((res) => setVendors(res.data)).catch(() => setVendors([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        contractNumber,
        vendorId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        warranty: warranty || undefined,
        coverage: coverage || undefined,
        exclusions: exclusions || undefined,
        paymentTerms: paymentTerms || undefined,
        cost: cost === "" ? undefined : Number(cost),
        renewal: renewal || undefined,
        sla: sla || undefined,
        status,
        notes: notes || undefined,
      };
      await maintenanceApi.createAmcContract(payload);
      router.push("/maintenance/amc");
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Create AMC contract</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/maintenance/amc">Back to AMC contracts</Link>
      </div>
      <form onSubmit={handleSubmit} style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Contract number<br />
            <input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Vendor<br />
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <label>
              Start date<br />
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              End date<br />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              Status<br />
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
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
              <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
            </label>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Warranty<br />
            <input value={warranty} onChange={(e) => setWarranty(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Coverage<br />
            <textarea rows={3} value={coverage} onChange={(e) => setCoverage(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Exclusions<br />
            <textarea rows={3} value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Payment terms<br />
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Renewal<br />
            <input value={renewal} onChange={(e) => setRenewal(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            SLA<br />
            <input value={sla} onChange={(e) => setSla(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>
            Notes<br />
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "Saving…" : "Create"}</button>
      </form>
    </div>
  );
}
