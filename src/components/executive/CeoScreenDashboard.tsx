/**
 * CEO Screen — Executive Command Center Dashboard Component
 *
 * Distills hundreds of streams & telemetry feeds into exactly 5 questions:
 * 1. What is broken?
 * 2. What will break?
 * 3. Why?
 * 4. What is the business impact?
 * 5. What should I do?
 */

import React, { useState, useEffect } from "react";
import type {
  CeoScreenSnapshot,
  PrescriptiveAction,
} from "../../ceo-command-center/domain/ceo-screen.types.js";

export const CeoScreenDashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<CeoScreenSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const fetchSnapshot = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/ceo-screen");
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Failed to load CEO screen snapshot:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleExecuteAction = async (actionId: string) => {
    try {
      setExecutingActionId(actionId);
      const res = await fetch(`/api/v1/ceo-screen/actions/${actionId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId: "executive-console" }),
      });
      if (res.ok) {
        await fetchSnapshot();
      }
    } catch (err) {
      console.error("Failed to execute prescriptive action:", err);
    } finally {
      setExecutingActionId(null);
    }
  };

  if (loading && !snapshot) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ color: "#94a3b8", marginTop: 12 }}>Synthesizing Fleet Intelligence...</p>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <div style={styles.badgeRow}>
            <span style={styles.kicker}>EXECUTIVE COMMAND CENTER</span>
            <span
              style={{
                ...styles.statusPill,
                backgroundColor:
                  snapshot.overallStatus === "RED"
                    ? "#ef4444"
                    : snapshot.overallStatus === "AMBER"
                      ? "#f59e0b"
                      : "#10b981",
              }}
            >
              FLEET STATUS: {snapshot.overallStatus}
            </span>
          </div>
          <h1 style={styles.title}>The CEO Screen</h1>
        </div>
        <div style={styles.headerMeta}>
          <span style={styles.timestamp}>Live Sync: {lastRefreshed}</span>
          <button style={styles.refreshButton} onClick={fetchSnapshot}>
            Refresh
          </button>
        </div>
      </header>

      {/* The 5 Headline Questions Grid */}
      <div style={styles.questionsGrid}>
        {/* Card 1: What is Broken? */}
        <div
          style={{ ...styles.card, ...(activeTab === 1 ? styles.cardActive : {}) }}
          onClick={() => setActiveTab(1)}
        >
          <div style={styles.cardHeader}>
            <span style={styles.questionNumber}>01</span>
            <span style={styles.questionLabel}>WHAT IS BROKEN?</span>
          </div>
          <div style={styles.headlineMetric}>{snapshot.whatIsBroken.summaryHeadline}</div>
          <div style={styles.metricSubtext}>
            {snapshot.whatIsBroken.criticalBranchesCount} Critical • {snapshot.whatIsBroken.fleetHealthPct}% Fleet Health
          </div>
        </div>

        {/* Card 2: What Will Break? */}
        <div
          style={{ ...styles.card, ...(activeTab === 2 ? styles.cardActive : {}) }}
          onClick={() => setActiveTab(2)}
        >
          <div style={styles.cardHeader}>
            <span style={styles.questionNumber}>02</span>
            <span style={styles.questionLabel}>WHAT WILL BREAK?</span>
          </div>
          <div style={{ ...styles.headlineMetric, color: "#f59e0b" }}>
            {snapshot.whatWillBreak.summaryHeadline}
          </div>
          <div style={styles.metricSubtext}>
            {snapshot.whatWillBreak.highRiskBranchesCount} High Likelihood • Predictive Horizon 72h
          </div>
        </div>

        {/* Card 3: Why? */}
        <div
          style={{ ...styles.card, ...(activeTab === 3 ? styles.cardActive : {}) }}
          onClick={() => setActiveTab(3)}
        >
          <div style={styles.cardHeader}>
            <span style={styles.questionNumber}>03</span>
            <span style={styles.questionLabel}>WHY? (ROOT CAUSE)</span>
          </div>
          <div style={{ ...styles.headlineMetric, fontSize: 18 }}>
            {snapshot.why.summaryHeadline}
          </div>
          <div style={styles.metricSubtext}>
            Dominant Driver: {snapshot.why.dominantCause}
          </div>
        </div>

        {/* Card 4: Business Impact */}
        <div
          style={{ ...styles.card, ...(activeTab === 4 ? styles.cardActive : {}) }}
          onClick={() => setActiveTab(4)}
        >
          <div style={styles.cardHeader}>
            <span style={styles.questionNumber}>04</span>
            <span style={styles.questionLabel}>BUSINESS IMPACT</span>
          </div>
          <div style={{ ...styles.headlineMetric, color: "#ec4899", fontSize: 18 }}>
            {snapshot.businessImpact.summaryHeadline}
          </div>
          <div style={styles.metricSubtext}>
            Risk Score: {snapshot.businessImpact.estimatedOperationalRiskScore}/100
          </div>
        </div>

        {/* Card 5: What Should I Do? */}
        <div
          style={{ ...styles.card, ...(activeTab === 5 ? styles.cardActive : {}), borderColor: "#3b82f6" }}
          onClick={() => setActiveTab(5)}
        >
          <div style={styles.cardHeader}>
            <span style={{ ...styles.questionNumber, color: "#60a5fa" }}>05</span>
            <span style={{ ...styles.questionLabel, color: "#93c5fd" }}>WHAT SHOULD I DO?</span>
          </div>
          <div style={{ ...styles.headlineMetric, color: "#60a5fa", fontSize: 16 }}>
            {snapshot.whatShouldIDo.summaryHeadline}
          </div>
          <div style={styles.metricSubtext}>
            {snapshot.whatShouldIDo.immediateActionsCount} Pending Prescriptive Actions
          </div>
        </div>
      </div>

      {/* Drill-down Detail Section based on selected question */}
      <div style={styles.detailPanel}>
        {activeTab === 1 && (
          <div>
            <h2 style={styles.detailTitle}>Active Degraded Branches ({snapshot.whatIsBroken.degradedBranchesCount})</h2>
            <div style={styles.table}>
              {snapshot.whatIsBroken.degradedBranches.map((b) => (
                <div key={b.branchId} style={styles.tableRow}>
                  <div>
                    <strong>{b.branchName}</strong> <span style={{ color: "#64748b" }}>({b.region})</span>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                      Issues: {b.activeIssues.join(" • ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        ...styles.severityBadge,
                        backgroundColor: b.severity === "CRITICAL" ? "#ef444422" : "#f59e0b22",
                        color: b.severity === "CRITICAL" ? "#ef4444" : "#f59e0b",
                      }}
                    >
                      {b.severity}
                    </span>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      {b.offlineCamerasCount} / {b.totalCamerasCount} Cams Offline
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 2 && (
          <div>
            <h2 style={styles.detailTitle}>Predictive Failure Horizon (72 Hours)</h2>
            <div style={styles.table}>
              {snapshot.whatWillBreak.predictions.map((p) => (
                <div key={p.branchId} style={styles.tableRow}>
                  <div>
                    <strong>{p.branchName}</strong> <span style={{ color: "#64748b" }}>({p.predictedHorizon})</span>
                    <div style={{ fontSize: 13, color: "#fbbf24", marginTop: 4 }}>
                      ⚠️ {p.leadingIndicator}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                      Preemptive: {p.recommendedPreemptiveAction}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 18, fontWeight: "bold", color: "#f59e0b" }}>
                      {p.failureLikelihoodPct}% Likelihood
                    </span>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      Confidence: {p.confidencePct}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 3 && (
          <div>
            <h2 style={styles.detailTitle}>Root Cause Distribution Breakdown</h2>
            <div style={styles.rootCauseGrid}>
              {snapshot.why.attributions.map((att) => (
                <div key={att.category} style={styles.rootCauseCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "bold", fontSize: 16 }}>{att.displayName}</span>
                    <span style={{ fontSize: 20, fontWeight: "bold", color: "#38bdf8" }}>
                      {att.percentageContribution}%
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>
                    Primary Symptom: <em>{att.primarySymptom}</em>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    Affected: {att.affectedBranchesCount} branches, {att.affectedDevicesCount} devices
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 4 && (
          <div>
            <h2 style={styles.detailTitle}>Regulatory Compliance & Critical Zone Exposure</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={styles.subCard}>
                <h3 style={{ fontSize: 15, color: "#f43f5e", marginBottom: 12 }}>Active Compliance Jeopardy</h3>
                {snapshot.businessImpact.complianceRisks.map((cr) => (
                  <div key={cr.riskId} style={{ padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
                    <div style={{ fontWeight: "bold", fontSize: 14 }}>{cr.mandate}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{cr.branchName} • {cr.details}</div>
                    <div style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>Exposure: {cr.potentialPenaltyEstimate}</div>
                  </div>
                ))}
              </div>
              <div style={styles.subCard}>
                <h3 style={{ fontSize: 15, color: "#38bdf8", marginBottom: 12 }}>Critical Zone Blindspots</h3>
                {snapshot.businessImpact.criticalZoneExposures.map((cz) => (
                  <div key={cz.zoneType} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
                    <span>{cz.zoneType}</span>
                    <span style={{ fontWeight: "bold", color: "#f43f5e" }}>
                      {cz.camerasBlind} Cameras Blind ({cz.branchesAffected} Branches)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 5 && (
          <div>
            <h2 style={styles.detailTitle}>Prescriptive Remediation Action Center (1-Click)</h2>
            <div style={styles.actionsList}>
              {snapshot.whatShouldIDo.actions.map((act) => (
                <div key={act.actionId} style={styles.actionRow}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ ...styles.urgencyBadge, backgroundColor: act.urgency.startsWith("P0") ? "#ef4444" : "#f59e0b" }}>
                        {act.urgency}
                      </span>
                      <strong style={{ fontSize: 16 }}>{act.title}</strong>
                    </div>
                    <p style={{ fontSize: 14, color: "#94a3b8", margin: "6px 0" }}>{act.description}</p>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      Targets: {act.targetBranchIds.join(", ")} • Est. Resolution: {act.estimatedTimeToResolveMinutes} min
                    </div>
                  </div>
                  <div>
                    {act.status === "COMPLETED" ? (
                      <span style={{ color: "#10b981", fontWeight: "bold", fontSize: 14 }}>
                        ✓ Completed
                      </span>
                    ) : (
                      <button
                        style={styles.executeButton}
                        disabled={executingActionId === act.actionId}
                        onClick={() => handleExecuteAction(act.actionId)}
                      >
                        {executingActionId === act.actionId ? "Executing..." : "Execute 1-Click"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    padding: 24,
    fontFamily: "Inter, -apple-system, sans-serif",
    minHeight: "100vh",
  },
  loadingContainer: {
    backgroundColor: "#0f172a",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 36,
    height: 36,
    border: "3px solid #334155",
    borderTop: "3px solid #38bdf8",
    borderRadius: "50%",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    borderBottom: "1px solid #1e293b",
    paddingBottom: 16,
  },
  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: "0.1em",
    fontWeight: 700,
    color: "#38bdf8",
  },
  statusPill: {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 9999,
    color: "#ffffff",
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  headerMeta: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  timestamp: {
    fontSize: 13,
    color: "#64748b",
  },
  refreshButton: {
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: 13,
  },
  questionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    padding: 16,
    border: "1px solid #334155",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  cardActive: {
    borderColor: "#38bdf8",
    backgroundColor: "#1e293bfa",
    boxShadow: "0 0 0 1px #38bdf8",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
  },
  questionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "#94a3b8",
  },
  headlineMetric: {
    fontSize: 20,
    fontWeight: 800,
    color: "#f8fafc",
    lineHeight: 1.25,
    marginBottom: 8,
  },
  metricSubtext: {
    fontSize: 12,
    color: "#64748b",
  },
  detailPanel: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    border: "1px solid #334155",
    padding: 20,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: "0 0 16px 0",
    color: "#f8fafc",
  },
  table: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  tableRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#0f172a",
    borderRadius: 6,
  },
  severityBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 4,
  },
  rootCauseGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 12,
  },
  rootCauseCard: {
    backgroundColor: "#0f172a",
    padding: 16,
    borderRadius: 6,
    border: "1px solid #334155",
  },
  subCard: {
    backgroundColor: "#0f172a",
    padding: 16,
    borderRadius: 6,
  },
  actionsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  actionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#0f172a",
    borderRadius: 6,
    border: "1px solid #334155",
  },
  urgencyBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: "2px 6px",
    borderRadius: 3,
    color: "#ffffff",
  },
  executeButton: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
};
