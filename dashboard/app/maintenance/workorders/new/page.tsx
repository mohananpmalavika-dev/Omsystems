"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { maintenanceApi } from "@/lib/api-client";

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [workOrderNumber, setWorkOrderNumber] = useState('WO-' + Date.now());
  const [problem, setProblem] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await maintenanceApi.createWorkOrder({ workOrderNumber, problem, severity });
      router.push('/maintenance/workorders');
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Create Work Order</h1>
      <form onSubmit={submit}>
        <div>
          <label>Work Order Number<input value={workOrderNumber} onChange={(e) => setWorkOrderNumber(e.target.value)} /></label>
        </div>
        <div>
          <label>Problem<textarea value={problem} onChange={(e) => setProblem(e.target.value)} /></label>
        </div>
        <div>
          <label>Severity<select value={severity} onChange={(e)=>setSeverity(e.target.value)}>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select></label>
        </div>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button type="submit">Create</button>
      </form>
    </div>
  );
}
