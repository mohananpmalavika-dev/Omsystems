"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [vendor, setVendor] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceCenters, setServiceCenters] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void maintenanceApi.getVendor(id).then((r) => { setVendor(r); setServiceCenters((r.serviceCenters ?? []).join("\n")); }).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: vendor.name.trim(), contact: vendor.contact?.trim() || null, email: vendor.email?.trim() || null, phone: vendor.phone?.trim() || null,
        serviceCenters: serviceCenters.split("\n").map((value) => value.trim()).filter(Boolean),
      };
      await maintenanceApi.updateVendor(id, payload);
      router.push('/maintenance/vendors');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!vendor) return <div style={{ padding: 16 }}>Vendor not found</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Vendor {vendor.id}</h1>
      <form onSubmit={handleSave} style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Name<br />
            <input value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Primary contact<br />
            <input value={vendor.contact ?? ""} onChange={(e) => setVendor({ ...vendor, contact: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Email<br />
            <input value={vendor.email ?? ""} onChange={(e) => setVendor({ ...vendor, email: e.target.value })} type="email" />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Phone<br />
            <input value={vendor.phone ?? ""} onChange={(e) => setVendor({ ...vendor, phone: e.target.value })} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Service centres <small>(one per line)</small><br />
            <textarea value={serviceCenters} onChange={(e) => setServiceCenters(e.target.value)} rows={3} />
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
