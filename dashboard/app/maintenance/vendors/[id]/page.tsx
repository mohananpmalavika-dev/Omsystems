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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void maintenanceApi.getVendor(id).then((r) => setVendor(r)).catch((err) => setError(err.message || String(err))).finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = { name: vendor.name, contactName: vendor.contactName || undefined, email: vendor.email || undefined, phone: vendor.phone || undefined, active: vendor.active };
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
          <label>Contact name<br />
            <input value={vendor.contactName ?? ""} onChange={(e) => setVendor({ ...vendor, contactName: e.target.value })} />
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
        <div style={{ marginBottom: 12 }}>
          <label><input type="checkbox" checked={vendor.active ?? true} onChange={(e) => setVendor({ ...vendor, active: e.target.checked })} /> Active</label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
