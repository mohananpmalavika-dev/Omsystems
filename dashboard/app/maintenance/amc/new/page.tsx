"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewAmcPage() {
  const router = useRouter();
  const [contractNumber, setContractNumber] = useState('AMC-' + Date.now());
  const [vendorId, setVendorId] = useState('');
  const [cost, setCost] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await maintenanceApi.createAmcContract({ contractNumber, vendorId, cost });
      router.push('/maintenance/amc');
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Create AMC Contract</h1>
      <form onSubmit={submit}>
        <div>
          <label>Contract Number<input value={contractNumber} onChange={(e)=>setContractNumber(e.target.value)} /></label>
        </div>
        <div>
          <label>Vendor ID<input value={vendorId} onChange={(e)=>setVendorId(e.target.value)} /></label>
        </div>
        <div>
          <label>Cost<input type="number" value={cost} onChange={(e)=>setCost(Number(e.target.value))} /></label>
        </div>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button type="submit">Create</button>
      </form>
    </div>
  );
}
