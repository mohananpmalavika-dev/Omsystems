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
  const [status, setStatus] = useState("pending");
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
        contractNumber: contractNumber.trim(),
        vendorId,
        startDate,
        endDate,
        warranty: warranty || undefined,
        coverage: coverage.trim(),
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
    <main className="record-form-page work-order-form-page">
      <header className="record-form-hero">
        <div>
          <span>Coverage & contracts</span>
          <h1>Create AMC contract</h1>
          <p>Capture contract dates, vendor coverage, service levels, and renewal value.</p>
        </div>
        <Link href="/maintenance/amc">Back to AMC contracts</Link>
      </header>

      <form className="work-order-form" onSubmit={handleSubmit}>
        <div className="work-order-form-grid">
          <label className="work-order-field">
            <span>Contract number <em>Required</em></span>
            <input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="AMC-2026-001" required />
          </label>

          <label className="work-order-field">
            <span>Vendor <em>Required</em></span>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </label>

          <label className="work-order-field">
            <span>Start date <em>Required</em></span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>

          <label className="work-order-field">
            <span>End date <em>Required</em></span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required min={startDate || undefined} />
          </label>

          <label className="work-order-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">pending</option>
              <option value="active">active</option>
              <option value="expired">expired</option>
              <option value="suspended">suspended</option>
            </select>
          </label>

          <label className="work-order-field">
            <span>Cost</span>
            <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </label>

          <label className="work-order-field work-order-field-wide">
            <span>Warranty</span>
            <input value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="12 months, parts included, labor support" />
          </label>

          <label className="work-order-field work-order-field-wide">
            <span>Coverage <em>Required</em></span>
            <textarea rows={3} value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder="List the supported devices, response windows, maintenance coverage scope, and service regions." minLength={5} required />
          </label>

          <label className="work-order-field work-order-field-wide">
            <span>Exclusions</span>
            <textarea rows={3} value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder="Parts not covered, emergency callouts excluded, physical damage exclusions, etc." />
          </label>

          <label className="work-order-field">
            <span>Payment terms</span>
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Annual, quarterly, per service" />
          </label>

          <label className="work-order-field">
            <span>Renewal</span>
            <input value={renewal} onChange={(e) => setRenewal(e.target.value)} placeholder="90-day renewal window" />
          </label>

          <label className="work-order-field">
            <span>SLA</span>
            <input value={sla} onChange={(e) => setSla(e.target.value)} placeholder="4h critical, 12h high" />
          </label>

          <label className="work-order-field work-order-field-wide">
            <span>Notes</span>
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes, escalation instructions, or renewal reminders." />
          </label>
        </div>

        {error && <p className="work-order-form-error" role="alert">{error}</p>}

        <footer className="work-order-form-footer">
          <p>AMC records are governed by vendor SLA coverage, renewal windows, and support commitments.</p>
          <button type="submit" disabled={loading}>{loading ? "Saving…" : "Create AMC contract"}</button>
        </footer>
      </form>
    </main>
  );
}
