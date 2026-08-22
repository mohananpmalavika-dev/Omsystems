"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, FileCheck2, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { privacyApi } from "@/lib/api-client";

export default function MaintenancePrivacyPage() {
  const [summary, setSummary] = useState<any>(null);
  const [purposes, setPurposes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    void Promise.all([privacyApi.getSummary(), privacyApi.listPurposes()])
      .then(([summaryData, purposesData]) => {
        setSummary(summaryData);
        setPurposes(purposesData.data ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="privacy-governance-page">
      <PageHero
        eyebrow="Privacy governance"
        title="Privacy & data protection"
        description="Manage lawful purposes, camera privacy controls, evidence handling, and breach response across the CCTV estate."
        icon={ShieldCheck}
        actions={<><Link className="btn-secondary" href="/maintenance/privacy/controls">Review controls</Link><Link className="btn-primary" href="/maintenance/privacy/purposes/new"><Plus size={15} /> Add purpose</Link></>}
      />

      {error && (
        <div className="page-alert error">
          {error}
        </div>
      )}

      <div className="privacy-summary-grid">
        <div className="privacy-summary-card"><span className="privacy-summary-icon"><FileCheck2 size={18} /></span><div>
          <h2>Active purposes</h2>
          <p>{loading ? "…" : summary?.activePurposes ?? 0}</p>
          <small>Lawful purposes in force</small>
        </div>
        </div>
        <div className="privacy-summary-card"><span className="privacy-summary-icon"><Camera size={18} /></span><div>
          <h2>Assigned camera purposes</h2>
          <p>{loading ? "…" : summary?.assignedPurposes ?? 0}</p>
          <small>Purpose-to-camera mappings</small>
        </div>
        </div>
        <div className="privacy-summary-card privacy-summary-card-alert"><span className="privacy-summary-icon"><ShieldAlert size={18} /></span><div>
          <h2>Open breaches</h2>
          <p>{loading ? "…" : summary?.openBreaches ?? 0}</p>
          <small>Cases awaiting closure</small>
        </div>
        </div>
      </div>

      <section className="privacy-register-panel">
        <div className="privacy-panel-heading">
          <div>
            <span>Processing register</span>
            <h2>Purpose register</h2>
            <p>Track lawful CCTV purposes, risk levels, and active status.</p>
          </div>
          <Link className="btn-secondary" href="/maintenance/privacy/purposes">View full register</Link>
        </div>

        {loading ? (
          <p>Loading purposes…</p>
        ) : purposes.length === 0 ? (
          <div className="privacy-empty-state"><FileCheck2 size={23} /><strong>No privacy purposes defined</strong><span>Add the first purpose to establish lawful processing coverage.</span></div>
        ) : (
          <div className="privacy-purpose-list">
            {purposes.slice(0, 5).map((purpose) => (
              <div className="privacy-purpose-row" key={purpose.id}>
                <div><h3>{purpose.name}</h3><p>{purpose.lawfulBasis}</p></div>
                <span>{purpose.riskLevel || "Unrated"} risk</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="privacy-action-grid">
        <Link href="/maintenance/privacy/purposes"><FileCheck2 size={18} /><div><strong>Manage processing purposes</strong><span>Review the lawful-basis register</span></div></Link>
        <Link href="/maintenance/privacy/cameras"><Camera size={18} /><div><strong>Assign camera purposes</strong><span>Map capture devices to approved use</span></div></Link>
        <Link href="/maintenance/privacy/breaches/new"><ShieldAlert size={18} /><div><strong>Report a privacy breach</strong><span>Open a governed response case</span></div></Link>
      </section>
    </div>
  );
}
