"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewVendorPage() {
  const router = useRouter();
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
      </form>
    </div>
  );
}
