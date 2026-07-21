"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewVendorPage() {
  const router = useRouter();
<<<<<<< HEAD
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: any = { name, contactName: contactName || undefined, email: email || undefined, phone: phone || undefined, active };
      await maintenanceApi.createVendor(payload);
      router.push('/maintenance/vendors');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Add Vendor</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Name<br />
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Contact name<br />
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
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
        <div style={{ marginBottom: 12 }}>
          <label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
=======
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await maintenanceApi.createVendor({ name, contact });
      router.push('/maintenance/vendors');
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>New Vendor</h1>
      <form onSubmit={submit}>
        <div>
          <label>Name<input value={name} onChange={(e)=>setName(e.target.value)} /></label>
        </div>
        <div>
          <label>Contact<input value={contact} onChange={(e)=>setContact(e.target.value)} /></label>
        </div>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button type="submit">Create</button>
>>>>>>> c3a5c2bcbd7e63f2e57e4b702517ddd24cd20012
      </form>
    </div>
  );
}
