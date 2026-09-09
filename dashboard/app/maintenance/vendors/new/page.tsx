"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewVendorPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceCenters, setServiceCenters] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(), contact: contact.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined,
        serviceCenters: serviceCenters.split("\n").map((value) => value.trim()).filter(Boolean),
      };
      await maintenanceApi.createVendor(payload);
      router.push('/maintenance/vendors');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="record-form-page" style={{ padding: 16 }}>
      <header className="record-form-hero">
        <div><span>Service network</span><h1>Add vendor</h1><p>Onboard a maintenance partner and record the primary escalation contact.</p></div>
      </header>
      <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Name<br />
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Primary contact<br />
            <input value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Email<br />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Phone<br />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Service centres <small>(one per line)</small><br />
            <textarea value={serviceCenters} onChange={(e) => setServiceCenters(e.target.value)} rows={3} />
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
