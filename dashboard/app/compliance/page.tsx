"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { complianceApi } from "@/lib/api-client";
import type { ComplianceFramework } from "@/lib/types";

export default function CompliancePage() {
  const [frameworks, setFrameworks] = useState<ComplianceFramework[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", source: "", description: "" });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await complianceApi.listFrameworks();
      setFrameworks(response.data as ComplianceFramework[]);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load compliance frameworks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createFramework(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await complianceApi.createFramework({
        name: form.name,
        source: form.source || undefined,
        description: form.description || undefined,
      });
      setFrameworks((prev) => [created, ...prev]);
      setForm({ name: "", source: "", description: "" });
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to create framework");
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Compliance frameworks</h1>
      <section style={{ marginBottom: 24 }}>
        <h2>Create framework</h2>
        <form onSubmit={createFramework} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
          <input
            placeholder="Framework name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <input
            placeholder="Source (e.g. ISO 27001)"
            value={form.source}
            onChange={(event) => setForm({ ...form, source: event.target.value })}
          />
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <button type="submit">Create framework</button>
        </form>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </section>

      <section>
        <h2>Framework list</h2>
        {loading ? (
          <p>Loading…</p>
        ) : frameworks.length === 0 ? (
          <p>No compliance frameworks found.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ borderBottom: "1px solid #ddd", textAlign: "left", padding: 8 }}>Name</th>
                <th style={{ borderBottom: "1px solid #ddd", textAlign: "left", padding: 8 }}>Source</th>
                <th style={{ borderBottom: "1px solid #ddd", textAlign: "left", padding: 8 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {frameworks.map((framework) => (
                <tr key={framework.id}>
                  <td style={{ padding: 8 }}>
                    <Link href={`/compliance/${framework.id}`}>{framework.name}</Link>
                  </td>
                  <td style={{ padding: 8 }}>{framework.source || "—"}</td>
                  <td style={{ padding: 8 }}>{new Date(framework.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
