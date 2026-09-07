"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import {
  Camera,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  RefreshCw,
  Plus,
  Clock,
  Shield,
  ArrowLeft,
  X,
  Check,
  RotateCcw,
  AlertOctagon,
  FileCheck,
} from "lucide-react";
import { IncidentImageModal } from "@/components/incident-image-modal";

type Workspace = {
  incident: any;
  participants: any[];
  cameras: any[];
  videoRanges: any[];
  clips: any[];
  snapshots: any[];
  evidenceItems: any[];
  evidencePackages: any[];
  tasks: any[];
  notes: any[];
  timeline: any[];
  policeIntimations: any[];
  insuranceClaims: any[];
  reports: any[];
  slaStatus: any;
  availableTransitions: string[];
};

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "video" | "evidence" | "tasks" | "timeline" | "report"
  >("overview");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    severity: "P3",
    confidentialityLevel: "internal",
    assignedTo: "",
    estimatedLoss: 0,
    policeRequired: false,
    insuranceRequired: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Transition Modal State
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);
  const [transitionNotes, setTransitionNotes] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Direct Close Modal State
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [closing, setClosing] = useState(false);

  // Reopen Modal State
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);

  // False Positive Modal State
  const [showFpModal, setShowFpModal] = useState(false);
  const [fpCategory, setFpCategory] = useState("shadow");
  const [fpReason, setFpReason] = useState("");
  const [fpImproveModel, setFpImproveModel] = useState(true);
  const [markingFp, setMarkingFp] = useState(false);

  // Task Completion Modal State
  const [taskToComplete, setTaskToComplete] = useState<any | null>(null);
  const [taskCompletionNotes, setTaskCompletionNotes] = useState("");
  const [completingTask, setCompletingTask] = useState(false);

  // Add Task Modal State
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    taskName: "",
    description: "",
    priority: "medium",
    isMandatory: false,
  });
  const [addingTask, setAddingTask] = useState(false);

  // Add Note State
  const [newNoteContent, setNewNoteContent] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Report Generation State
  const [generatingReport, setGeneratingReport] = useState(false);

  const incidentId = typeof params?.id === "string" ? params.id : "";

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/workspace`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || body?.error || "Failed to load incident workspace");
      }
      const data = await res.json();
      const ws = data.data || data;
      setWorkspace(ws);

      // Populate edit form defaults
      if (ws.incident) {
        setEditForm({
          title: ws.incident.title || "",
          description: ws.incident.description || "",
          severity: ws.incident.severity || "P3",
          confidentialityLevel: ws.incident.confidentialityLevel || "internal",
          assignedTo: ws.incident.assignedTo || "",
          estimatedLoss: ws.incident.estimatedLoss || 0,
          policeRequired: Boolean(ws.incident.policeRequired),
          insuranceRequired: Boolean(ws.incident.insuranceRequired),
        });
      }
    } catch (e: any) {
      setError(e.message || "Error loading workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (incidentId) {
      loadWorkspace();
    }
  }, [incidentId]);

  function showToast(type: "success" | "error", text: string) {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback(null);
    }, 5000);
  }

  // Handle Edit Incident
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          severity: editForm.severity,
          confidentialityLevel: editForm.confidentialityLevel,
          assignedTo: editForm.assignedTo.trim() || null,
          estimatedLoss: Number(editForm.estimatedLoss) || 0,
          policeRequired: editForm.policeRequired,
          insuranceRequired: editForm.insuranceRequired,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error || "Failed to update incident");
      }

      setShowEditModal(false);
      showToast("success", "Incident details updated successfully.");
      await loadWorkspace();
    } catch (err: any) {
      showToast("error", err.message || "Failed to update incident");
    } finally {
      setSavingEdit(false);
    }
  }

  // Handle Workflow Status Transition
  async function handleConfirmTransition() {
    if (!selectedTransition) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: selectedTransition,
          notes: transitionNotes.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const errorList = data?.errors?.join("; ") || data?.message || data?.error || "Transition failed";
        setTransitionError(errorList);
        return;
      }

      setSelectedTransition(null);
      setTransitionNotes("");
      showToast("success", `Incident status transitioned to ${selectedTransition}.`);
      await loadWorkspace();
    } catch (e: any) {
      setTransitionError(e.message || "Failed to transition status");
    } finally {
      setTransitioning(false);
    }
  }

  // Handle Direct Close
  async function handleDirectClose() {
    setClosing(true);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: closeNotes.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "Failed to close incident");
      }

      setShowCloseModal(false);
      setCloseNotes("");
      showToast("success", "Incident closed successfully.");
      await loadWorkspace();
    } catch (e: any) {
      showToast("error", e.message || "Failed to close incident");
    } finally {
      setClosing(false);
    }
  }

  // Handle Reopen
  async function handleReopen() {
    if (reopenReason.trim().length < 10) {
      alert("Please provide at least 10 characters for the reopen reason.");
      return;
    }
    setReopening(true);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "Failed to reopen incident");
      }

      setShowReopenModal(false);
      setReopenReason("");
      showToast("success", "Incident reopened and returned to investigation.");
      await loadWorkspace();
    } catch (e: any) {
      showToast("error", e.message || "Failed to reopen incident");
    } finally {
      setReopening(false);
    }
  }

  // Handle False Positive Confirmation
  async function handleConfirmFalsePositive() {
    if (!fpReason.trim()) {
      alert("Please provide a reason for the false positive.");
      return;
    }
    setMarkingFp(true);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/mark-false-positive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: fpCategory,
          reason: fpReason.trim(),
          improveModel: fpImproveModel,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "Failed to mark false positive");
      }

      setShowFpModal(false);
      setFpReason("");
      showToast("success", "Incident marked as false positive and closed.");
      await loadWorkspace();
    } catch (e: any) {
      showToast("error", e.message || "Failed to mark false positive");
    } finally {
      setMarkingFp(false);
    }
  }

  // Complete Investigation Task
  async function handleConfirmCompleteTask() {
    if (!taskToComplete) return;
    setCompletingTask(true);
    try {
      const res = await fetch(`/api/control/v1/tasks/${taskToComplete.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completionNotes: taskCompletionNotes.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "Failed to complete task");
      }

      setTaskToComplete(null);
      setTaskCompletionNotes("");
      showToast("success", "Investigation task marked as completed.");
      await loadWorkspace();
    } catch (e: any) {
      showToast("error", e.message || "Failed to complete task");
    } finally {
      setCompletingTask(false);
    }
  }

  // Add Task
  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskForm.taskName.trim()) return;
    setAddingTask(true);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName: newTaskForm.taskName.trim(),
          description: newTaskForm.description.trim() || undefined,
          priority: newTaskForm.priority,
          isMandatory: newTaskForm.isMandatory,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "Failed to add task");
      }

      setShowAddTaskModal(false);
      setNewTaskForm({ taskName: "", description: "", priority: "medium", isMandatory: false });
      showToast("success", "Task added successfully.");
      await loadWorkspace();
    } catch (e: any) {
      showToast("error", e.message || "Failed to add task");
    } finally {
      setAddingTask(false);
    }
  }

  // Add Note
  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteContent.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteType: "investigation",
          content: newNoteContent.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "Failed to add note");
      }

      setNewNoteContent("");
      showToast("success", "Investigation note recorded.");
      await loadWorkspace();
    } catch (e: any) {
      showToast("error", e.message || "Failed to record note");
    } finally {
      setAddingNote(false);
    }
  }

  // Generate Report
  async function handleGenerateReport(reportType: "investigation" | "final" = "investigation") {
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/generate-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType,
          autoGenerateSummary: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "Failed to generate report");
      }

      showToast("success", "Investigation report auto-generated successfully.");
      setActiveTab("report");
      await loadWorkspace();
    } catch (e: any) {
      showToast("error", e.message || "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  }

  // Approve Report
  async function handleApproveReport(reportId: string) {
    try {
      const res = await fetch(`/api/control/v1/incident-reports/${reportId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "Failed to approve report");
      }

      showToast("success", "Investigation report approved.");
      await loadWorkspace();
    } catch (e: any) {
      showToast("error", e.message || "Failed to approve report");
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div style={{ padding: "60px", textAlign: "center", color: "#6b7280" }}>
          <RefreshCw className="animate-spin" size={32} style={{ margin: "0 auto 16px" }} />
          Loading investigation workspace...
        </div>
      </AppLayout>
    );
  }

  if (error || !workspace) {
    return (
      <AppLayout>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ color: "#dc2626", marginBottom: "16px", fontWeight: 600 }}>
            {error || "Incident not found"}
          </div>
          <button
            onClick={() => router.push("/incidents")}
            style={{
              padding: "10px 20px",
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            ← Back to Incidents
          </button>
        </div>
      </AppLayout>
    );
  }

  const {
    incident,
    tasks = [],
    timeline = [],
    evidenceItems = [],
    videoRanges = [],
    reports = [],
    slaStatus,
    availableTransitions = [],
  } = workspace;

  const isClosedOrResolved = ["closed", "resolved", "false-positive", "cancelled"].includes(
    incident.status
  );

  // Closure readiness computation
  const mandatoryTasks = tasks.filter((t: any) => t.isMandatory);
  const incompleteMandatory = mandatoryTasks.filter((t: any) => t.status !== "completed");
  const hasApprovedReport = reports.some(
    (r: any) => r.status === "approved" || r.status === "final"
  );
  const isCritical = ["P1", "P2"].includes(incident.severity);
  const closureReady =
    incompleteMandatory.length === 0 && (!isCritical || hasApprovedReport);

  return (
    <AppLayout>
      <div className="content" style={{ padding: "24px", maxWidth: "1600px", margin: "0 auto" }}>
        {/* Feedback Banner */}
        {feedback && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: feedback.type === "success" ? "#ecfdf5" : "#fef2f2",
              border: `1px solid ${feedback.type === "success" ? "#a7f3d0" : "#fecaca"}`,
              color: feedback.type === "success" ? "#065f46" : "#991b1b",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {feedback.type === "success" ? <Check size={18} /> : <AlertTriangle size={18} />}
              <span>{feedback.text}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Header Bar */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <button
              onClick={() => router.push("/incidents")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                backgroundColor: "#f3f4f6",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                color: "#374151",
              }}
            >
              <ArrowLeft size={16} /> Back to Incidents
            </button>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setShowEditModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#1f2937",
                }}
              >
                <Edit3 size={16} /> Edit Incident
              </button>

              {!isClosedOrResolved && (
                <button
                  onClick={() => setShowCloseModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    backgroundColor: "#059669",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#ffffff",
                  }}
                >
                  <CheckCircle2 size={16} /> Close Incident
                </button>
              )}

              {isClosedOrResolved && (
                <button
                  onClick={() => setShowReopenModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    backgroundColor: "#f59e0b",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#ffffff",
                  }}
                >
                  <RotateCcw size={16} /> Reopen Incident
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                <h1 style={{ fontSize: "26px", fontWeight: "bold", margin: 0 }}>
                  {incident.incidentNumber}
                </h1>
                <StatusBadge status={incident.status} />
                <SeverityBadge severity={incident.severity} />
              </div>
              <p style={{ fontSize: "18px", color: "#4b5563", margin: 0 }}>
                {incident.title}
              </p>
            </div>
          </div>
        </div>

        {/* Key Info Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "14px",
            marginBottom: "20px",
          }}
        >
          <InfoCard label="Detection Source" value={incident.detectionSource || "Manual"} />
          <InfoCard
            label="Occurred At"
            value={incident.occurredAt ? new Date(incident.occurredAt).toLocaleString() : "N/A"}
          />
          <InfoCard
            label="AI Confidence"
            value={incident.aiConfidence ? `${Math.round(incident.aiConfidence * 100)}%` : "N/A"}
          />
          <InfoCard label="Assigned To" value={incident.assignedTo || "Unassigned"} />
          <InfoCard label="Confidentiality" value={incident.confidentialityLevel || "Internal"} />
        </div>

        {/* SLA Alert */}
        {slaStatus?.nextDeadline && slaStatus.nextDeadline.minutesRemaining < 30 && (
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <Clock size={20} color="#dc2626" />
            <div>
              <strong>SLA Warning:</strong> {slaStatus.nextDeadline.type} deadline in{" "}
              {slaStatus.nextDeadline.minutesRemaining} minutes
            </div>
          </div>
        )}

        {/* Closure Readiness Checklist Card */}
        <div
          style={{
            padding: "16px 20px",
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
              <Shield size={18} /> Closure Readiness Evaluation
            </h3>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: closureReady ? "#dcfce7" : "#fef3c7",
                color: closureReady ? "#15803d" : "#b45309",
              }}
            >
              {closureReady ? "Ready for Resolution / Closure" : "Action Required Before Closure"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            <ChecklistPill
              label="Mandatory Tasks"
              status={incompleteMandatory.length === 0 ? "pass" : "fail"}
              detail={
                mandatoryTasks.length === 0
                  ? "No mandatory tasks"
                  : `${mandatoryTasks.length - incompleteMandatory.length}/${mandatoryTasks.length} Completed`
              }
            />
            <ChecklistPill
              label="Video Evidence"
              status={videoRanges.length > 0 ? "pass" : "warn"}
              detail={`${videoRanges.length} preserved range(s)`}
            />
            <ChecklistPill
              label="Investigation Report"
              status={!isCritical || hasApprovedReport ? "pass" : "fail"}
              detail={
                !isCritical
                  ? "Optional for non-critical"
                  : hasApprovedReport
                  ? "Approved"
                  : "Required for P1/P2"
              }
            />
            <ChecklistPill
              label="Follow-up Workflows"
              status="pass"
              detail={
                incident.policeRequired
                  ? "Police follow-up active"
                  : incident.insuranceRequired
                  ? "Insurance claim tracked"
                  : "Standard resolution"
              }
            />
          </div>
        </div>

        {/* Available Actions Bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
            marginBottom: "24px",
            padding: "16px",
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        >
          <div style={{ width: "100%", fontSize: "13px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            Workflow Transitions
          </div>

          {availableTransitions.map((status: string) => (
            <button
              key={status}
              onClick={() => {
                setSelectedTransition(status);
                setTransitionNotes("");
                setTransitionError(null);
              }}
              style={{
                padding: "8px 16px",
                backgroundColor: status === "closed" ? "#059669" : status === "resolved" ? "#10b981" : "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              → {status.replace(/-/g, " ")}
            </button>
          ))}

          {incident.status !== "false-positive" && !isClosedOrResolved && (
            <button
              onClick={() => setShowFpModal(true)}
              style={{
                padding: "8px 16px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <AlertOctagon size={15} /> Mark False Positive
            </button>
          )}
        </div>

        {/* Tabs Navigation */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "16px",
            borderBottom: "2px solid #e5e7eb",
            overflowX: "auto",
          }}
        >
          {(["overview", "tasks", "video", "evidence", "report", "timeline"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 22px",
                border: "none",
                background: "transparent",
                borderBottom: activeTab === tab ? "2px solid #2563eb" : "none",
                color: activeTab === tab ? "#2563eb" : "#6b7280",
                cursor: "pointer",
                fontWeight: activeTab === tab ? 600 : 500,
                textTransform: "capitalize",
                marginBottom: "-2px",
                whiteSpace: "nowrap",
                fontSize: "14px",
              }}
            >
              {tab === "tasks" ? `Tasks (${tasks.length})` : tab === "video" ? `Video (${videoRanges.length})` : tab === "report" ? `Reports (${reports.length})` : tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            padding: "24px",
          }}
        >
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ margin: 0, fontSize: "20px" }}>Incident Summary</h2>
                <button
                  onClick={() => setShowEditModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    fontSize: "13px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  <Edit3 size={14} /> Edit
                </button>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <strong style={{ color: "#374151" }}>Description:</strong>
                <p style={{ color: "#4b5563", whiteSpace: "pre-wrap", marginTop: "6px", lineHeight: "1.6" }}>
                  {incident.description || "No description provided."}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "16px",
                  padding: "16px",
                  backgroundColor: "#f9fafb",
                  borderRadius: "8px",
                  marginBottom: "24px",
                }}
              >
                <div>
                  <span style={{ color: "#6b7280", fontSize: "12px", display: "block" }}>Incident Type</span>
                  <strong>{incident.incidentType || "other"}</strong>
                </div>
                <div>
                  <span style={{ color: "#6b7280", fontSize: "12px", display: "block" }}>Branch / Location</span>
                  <strong>{incident.branchId || "Enterprise General"}</strong>
                </div>
                <div>
                  <span style={{ color: "#6b7280", fontSize: "12px", display: "block" }}>Reported By</span>
                  <strong>{incident.reportedBy || "System Operator"}</strong>
                </div>
                <div>
                  <span style={{ color: "#6b7280", fontSize: "12px", display: "block" }}>Estimated Loss</span>
                  <strong>{incident.estimatedLoss ? `$${Number(incident.estimatedLoss).toLocaleString()}` : "None noted"}</strong>
                </div>
              </div>

              {/* Snapshot Preview */}
              <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    <Camera size={16} /> Incident Visual Evidence Snapshot
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowImageModal(true)}
                    style={{
                      padding: "4px 12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      backgroundColor: "#eff6ff",
                      color: "#2563eb",
                      border: "1px solid #bfdbfe",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Enlarge Image
                  </button>
                </div>
                <div
                  onClick={() => setShowImageModal(true)}
                  style={{
                    position: "relative",
                    maxWidth: "520px",
                    height: "290px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/control/v1/alerts/${incident.id}/evidence/snapshot`}
                    alt={incident.title || "Incident snapshot"}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "8px",
                      left: "8px",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(0,0,0,0.75)",
                      color: "#f8fafc",
                      fontSize: "11px",
                    }}
                  >
                    Click to inspect in high resolution
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TASKS */}
          {activeTab === "tasks" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "20px" }}>Investigation Tasks</h2>
                  <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "14px" }}>
                    Complete mandatory checklist items to authorize incident closure.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddTaskModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    backgroundColor: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  <Plus size={15} /> Add Task
                </button>
              </div>

              {tasks.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#6b7280", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
                  No investigation tasks assigned yet. Click "Add Task" to create one.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {tasks.map((task: any) => (
                    <div
                      key={task.id}
                      style={{
                        padding: "16px",
                        backgroundColor: task.status === "completed" ? "#f0fdf4" : "#ffffff",
                        border: `1px solid ${task.status === "completed" ? "#bbf7d0" : "#e5e7eb"}`,
                        borderLeft: task.isMandatory ? "4px solid #dc2626" : "4px solid #3b82f6",
                        borderRadius: "6px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                          {task.taskName}
                          {task.isMandatory && (
                            <span
                              style={{
                                color: "#b91c1c",
                                backgroundColor: "#fee2e2",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                              }}
                            >
                              MANDATORY FOR CLOSURE
                            </span>
                          )}
                          {task.status === "completed" && (
                            <span style={{ color: "#15803d", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <CheckCircle2 size={14} /> Completed
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <div style={{ fontSize: "14px", color: "#4b5563", marginTop: "6px" }}>
                            {task.description}
                          </div>
                        )}
                        <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "8px" }}>
                          Priority: {task.priority?.toUpperCase()} | Status: {task.status}
                          {task.completedBy && ` | Completed by: ${task.completedBy}`}
                        </div>
                      </div>

                      {task.status !== "completed" && (
                        <button
                          onClick={() => {
                            setTaskToComplete(task);
                            setTaskCompletionNotes("");
                          }}
                          style={{
                            padding: "6px 14px",
                            backgroundColor: "#10b981",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Mark Complete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VIDEO EVIDENCE */}
          {activeTab === "video" && (
            <div>
              <h2 style={{ marginTop: 0, fontSize: "20px" }}>Preserved Video Evidence</h2>
              <p style={{ color: "#6b7280", fontSize: "14px" }}>
                Preserved forensic streams under legal retention hold.
              </p>

              {videoRanges.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#6b7280", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
                  No video ranges preserved for this incident yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
                  {videoRanges.map((range: any) => (
                    <div
                      key={range.id}
                      style={{
                        padding: "16px",
                        backgroundColor: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div><strong>Camera:</strong> {range.cameraId}</div>
                      <div><strong>From:</strong> {new Date(range.fromAt).toLocaleString()}</div>
                      <div><strong>To:</strong> {new Date(range.toAt).toLocaleString()}</div>
                      <div>
                        <strong>Legal Hold:</strong>{" "}
                        <span style={{ color: range.legalHoldApplied ? "#dc2626" : "#4b5563", fontWeight: 600 }}>
                          {range.legalHoldApplied ? "Active Hold" : "Standard Retention"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EVIDENCE ITEMS */}
          {activeTab === "evidence" && (
            <div>
              <h2 style={{ marginTop: 0, fontSize: "20px" }}>Evidence Repository</h2>
              <p style={{ color: "#6b7280", fontSize: "14px" }}>
                {evidenceItems.length} registered evidence asset(s) linked to this incident.
              </p>

              {evidenceItems.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#6b7280", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
                  No evidence assets attached yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
                  {evidenceItems.map((item: any) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "16px",
                        backgroundColor: "#f9fafb",
                        borderRadius: "6px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                        Type: {item.itemType} | Added: {new Date(item.createdAt).toLocaleString()}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: "14px", color: "#4b5563", marginTop: "6px" }}>
                          {item.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: REPORTS */}
          {activeTab === "report" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "20px" }}>Investigation & Post-Incident Reports</h2>
                  <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "14px" }}>
                    Approved investigation report required for closing P1 and P2 security incidents.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => handleGenerateReport("investigation")}
                    disabled={generatingReport}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FileText size={15} />
                    {generatingReport ? "Generating Report..." : "Auto-Generate Report"}
                  </button>
                </div>
              </div>

              {reports.length === 0 ? (
                <div style={{ padding: "36px", textAlign: "center", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                  <FileCheck size={36} color="#94a3b8" style={{ margin: "0 auto 12px" }} />
                  <div style={{ fontWeight: 600, color: "#334155", marginBottom: "4px" }}>No Reports Generated Yet</div>
                  <p style={{ color: "#64748b", fontSize: "14px", maxWidth: "480px", margin: "0 auto 16px" }}>
                    Click "Auto-Generate Report" to compile findings, chronology, tasks, and evidence into an investigation dossier.
                  </p>
                  <button
                    onClick={() => handleGenerateReport("investigation")}
                    style={{
                      padding: "8px 18px",
                      backgroundColor: "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 500,
                    }}
                  >
                    Generate Investigation Report
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {reports.map((report: any) => (
                    <div
                      key={report.id}
                      style={{
                        padding: "20px",
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "16px", color: "#1e293b" }}>
                            {report.reportNumber || "Report"} — {report.reportType?.toUpperCase()}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                            Generated: {new Date(report.createdAt).toLocaleString()} | Created by: {report.createdBy || "System"}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              backgroundColor: report.status === "approved" || report.status === "final" ? "#dcfce7" : "#fef3c7",
                              color: report.status === "approved" || report.status === "final" ? "#166534" : "#92400e",
                            }}
                          >
                            {report.status?.toUpperCase()}
                          </span>

                          {report.status !== "approved" && report.status !== "final" && (
                            <button
                              onClick={() => handleApproveReport(report.id)}
                              style={{
                                padding: "4px 12px",
                                backgroundColor: "#10b981",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Approve Report
                            </button>
                          )}
                        </div>
                      </div>

                      {report.executiveSummary && (
                        <div style={{ marginBottom: "14px" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                            Executive Summary:
                          </div>
                          <p style={{ fontSize: "14px", color: "#334155", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5, backgroundColor: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
                            {report.executiveSummary}
                          </p>
                        </div>
                      )}

                      {report.findings && (
                        <div style={{ marginBottom: "14px" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                            Findings & Evidence Breakdown:
                          </div>
                          <p style={{ fontSize: "14px", color: "#334155", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5, backgroundColor: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
                            {report.findings}
                          </p>
                        </div>
                      )}

                      {report.detailedChronology && (
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                            Chronology:
                          </div>
                          <p style={{ fontSize: "13px", color: "#334155", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5, backgroundColor: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
                            {report.detailedChronology}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: TIMELINE & NOTES */}
          {activeTab === "timeline" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ margin: 0, fontSize: "20px" }}>Incident Timeline & Audit Trail</h2>
              </div>

              {/* Add Note Input */}
              <form onSubmit={handleAddNote} style={{ marginBottom: "24px", display: "flex", gap: "10px" }}>
                <input
                  type="text"
                  placeholder="Record an investigation note or update..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
                <button
                  type="submit"
                  disabled={addingNote || !newNoteContent.trim()}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  {addingNote ? "Adding..." : "Add Note"}
                </button>
              </form>

              {/* Timeline List */}
              <div style={{ borderLeft: "2px solid #e5e7eb", paddingLeft: "24px", marginLeft: "12px" }}>
                {timeline.map((event: any, idx: number) => (
                  <div key={event.id || idx} style={{ marginBottom: "20px", position: "relative" }}>
                    <div
                      style={{
                        position: "absolute",
                        left: "-29px",
                        top: "4px",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: "#2563eb",
                        border: "2px solid white",
                      }}
                    />
                    <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>
                      {new Date(event.createdAt || event.timestamp).toLocaleString()} • {event.createdBy || event.actor?.userName || "System"}
                    </div>
                    <div style={{ fontWeight: 500, color: "#1f2937" }}>{event.description}</div>
                    {event.eventType && (
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                        Event Type: {event.eventType}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MODAL 1: EDIT INCIDENT DETAILS */}
        {showEditModal && (
          <ModalOverlay onClose={() => setShowEditModal(false)}>
            <form onSubmit={handleSaveEdit} style={{ width: "100%", maxWidth: "600px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Edit Incident Details</h3>
                <button type="button" onClick={() => setShowEditModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <label>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                    Incident Title *
                  </span>
                  <input
                    type="text"
                    required
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                  />
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <label>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                      Severity
                    </span>
                    <select
                      value={editForm.severity}
                      onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                    >
                      <option value="P1">P1 - Critical</option>
                      <option value="P2">P2 - High</option>
                      <option value="P3">P3 - Medium</option>
                      <option value="P4">P4 - Low</option>
                      <option value="P5">P5 - Informational</option>
                    </select>
                  </label>

                  <label>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                      Confidentiality
                    </span>
                    <select
                      value={editForm.confidentialityLevel}
                      onChange={(e) => setEditForm({ ...editForm, confidentialityLevel: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                    >
                      <option value="public">Public</option>
                      <option value="internal">Internal</option>
                      <option value="confidential">Confidential</option>
                      <option value="restricted">Restricted</option>
                      <option value="highly-restricted">Highly Restricted</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <label>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                      Assigned Operator (User ID / Name)
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. operator-john"
                      value={editForm.assignedTo}
                      onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                    />
                  </label>

                  <label>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                      Estimated Loss ($)
                    </span>
                    <input
                      type="number"
                      value={editForm.estimatedLoss}
                      onChange={(e) => setEditForm({ ...editForm, estimatedLoss: Number(e.target.value) })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                    />
                  </label>
                </div>

                <label>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                    Description
                  </span>
                  <textarea
                    rows={4}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                  />
                </label>

                <div style={{ display: "flex", gap: "20px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editForm.policeRequired}
                      onChange={(e) => setEditForm({ ...editForm, policeRequired: e.target.checked })}
                    />
                    Police Follow-up Required
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editForm.insuranceRequired}
                      onChange={(e) => setEditForm({ ...editForm, insuranceRequired: e.target.checked })}
                    />
                    Insurance Claim Required
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    style={{ padding: "8px 16px", border: "1px solid #d1d5db", background: "white", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    style={{ padding: "8px 18px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                  >
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </ModalOverlay>
        )}

        {/* MODAL 2: WORKFLOW TRANSITION CONFIRMATION */}
        {selectedTransition && (
          <ModalOverlay onClose={() => setSelectedTransition(null)}>
            <div style={{ width: "100%", maxWidth: "500px" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 700 }}>
                Confirm State Transition
              </h3>
              <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "16px" }}>
                Transition incident status to <strong style={{ color: "#2563eb" }}>{selectedTransition}</strong>?
              </p>

              {transitionError && (
                <div style={{ padding: "10px 14px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", color: "#991b1b", fontSize: "13px", marginBottom: "14px" }}>
                  {transitionError}
                </div>
              )}

              <label style={{ display: "block", marginBottom: "16px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Transition Notes (Optional)
                </span>
                <textarea
                  rows={3}
                  placeholder="Add context or notes for this status transition..."
                  value={transitionNotes}
                  onChange={(e) => setTransitionNotes(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedTransition(null)}
                  style={{ padding: "8px 16px", border: "1px solid #d1d5db", background: "white", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmTransition}
                  disabled={transitioning}
                  style={{ padding: "8px 18px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {transitioning ? "Transitioning..." : "Confirm Transition"}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {/* MODAL 3: DIRECT CLOSE INCIDENT */}
        {showCloseModal && (
          <ModalOverlay onClose={() => setShowCloseModal(false)}>
            <div style={{ width: "100%", maxWidth: "500px" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle2 size={20} color="#059669" /> Close Incident
              </h3>
              <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "16px" }}>
                Closing this incident stops SLA timers and records full forensic closure.
              </p>

              <label style={{ display: "block", marginBottom: "16px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Resolution Notes / Actions Taken
                </span>
                <textarea
                  rows={4}
                  placeholder="Summarize findings, root cause, and resolving actions..."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  style={{ padding: "8px 16px", border: "1px solid #d1d5db", background: "white", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDirectClose}
                  disabled={closing}
                  style={{ padding: "8px 18px", backgroundColor: "#059669", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {closing ? "Closing..." : "Close Incident"}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {/* MODAL 4: REOPEN INCIDENT */}
        {showReopenModal && (
          <ModalOverlay onClose={() => setShowReopenModal(false)}>
            <div style={{ width: "100%", maxWidth: "500px" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <RotateCcw size={20} color="#f59e0b" /> Reopen Incident
              </h3>
              <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "16px" }}>
                Reopening puts the incident back into active investigation. A justification of at least 10 characters is required for forensic compliance.
              </p>

              <label style={{ display: "block", marginBottom: "16px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Reopening Justification *
                </span>
                <textarea
                  rows={4}
                  required
                  placeholder="Explain why this incident is being reopened (min 10 characters)..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  style={{ padding: "8px 16px", border: "1px solid #d1d5db", background: "white", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={reopening || reopenReason.trim().length < 10}
                  style={{ padding: "8px 18px", backgroundColor: "#f59e0b", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {reopening ? "Reopening..." : "Confirm Reopen"}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {/* MODAL 5: MARK FALSE POSITIVE */}
        {showFpModal && (
          <ModalOverlay onClose={() => setShowFpModal(false)}>
            <div style={{ width: "100%", maxWidth: "500px" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px", color: "#dc2626" }}>
                <AlertOctagon size={20} /> Mark as False Positive
              </h3>
              <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "16px" }}>
                Record this detection as a false alarm and automatically close the incident.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <label>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                    False Alarm Category *
                  </span>
                  <select
                    value={fpCategory}
                    onChange={(e) => setFpCategory(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                  >
                    <option value="shadow">Shadow / Lighting Variation</option>
                    <option value="animal">Animal / Bird / Insect</option>
                    <option value="reflection">Glass / Surface Reflection</option>
                    <option value="weather">Weather / Rain / Wind movement</option>
                    <option value="known-employee">Authorized Staff in Zone</option>
                    <option value="expected-activity">Scheduled / Expected Activity</option>
                    <option value="duplicate">Duplicate Alert</option>
                    <option value="other">Other Non-Threat</option>
                  </select>
                </label>

                <label>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                    Reason / Operator Justification *
                  </span>
                  <textarea
                    rows={3}
                    required
                    placeholder="Describe why this alert is confirmed false..."
                    value={fpReason}
                    onChange={(e) => setFpReason(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#374151" }}>
                  <input
                    type="checkbox"
                    checked={fpImproveModel}
                    onChange={(e) => setFpImproveModel(e.target.checked)}
                  />
                  Feedback this false alarm to improve the AI detection model
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setShowFpModal(false)}
                    style={{ padding: "8px 16px", border: "1px solid #d1d5db", background: "white", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmFalsePositive}
                    disabled={markingFp || !fpReason.trim()}
                    style={{ padding: "8px 18px", backgroundColor: "#dc2626", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                  >
                    {markingFp ? "Submitting..." : "Confirm False Positive"}
                  </button>
                </div>
              </div>
            </div>
          </ModalOverlay>
        )}

        {/* MODAL 6: COMPLETE TASK */}
        {taskToComplete && (
          <ModalOverlay onClose={() => setTaskToComplete(null)}>
            <div style={{ width: "100%", maxWidth: "480px" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "18px", fontWeight: 700 }}>
                Complete Investigation Task
              </h3>
              <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "14px" }}>
                Marking <strong>{taskToComplete.taskName}</strong> as completed.
              </p>

              <label style={{ display: "block", marginBottom: "16px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Completion Notes (Optional)
                </span>
                <textarea
                  rows={3}
                  placeholder="Record observations, actions taken, or results..."
                  value={taskCompletionNotes}
                  onChange={(e) => setTaskCompletionNotes(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setTaskToComplete(null)}
                  style={{ padding: "8px 16px", border: "1px solid #d1d5db", background: "white", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCompleteTask}
                  disabled={completingTask}
                  style={{ padding: "8px 18px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {completingTask ? "Completing..." : "Complete Task"}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {/* MODAL 7: ADD TASK */}
        {showAddTaskModal && (
          <ModalOverlay onClose={() => setShowAddTaskModal(false)}>
            <form onSubmit={handleAddTask} style={{ width: "100%", maxWidth: "500px" }}>
              <h3 style={{ margin: "0 0 14px", fontSize: "18px", fontWeight: 700 }}>
                Add Investigation Task
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <label>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                    Task Name *
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Verify entry logbook with security guard"
                    value={newTaskForm.taskName}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, taskName: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                  />
                </label>

                <label>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                    Description
                  </span>
                  <textarea
                    rows={3}
                    placeholder="Detailed task instructions or context..."
                    value={newTaskForm.description}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                  />
                </label>

                <label>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                    Priority
                  </span>
                  <select
                    value={newTaskForm.priority}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={newTaskForm.isMandatory}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, isMandatory: e.target.checked })}
                  />
                  Mark as <strong>Mandatory</strong> (blocks incident closure until completed)
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setShowAddTaskModal(false)}
                    style={{ padding: "8px 16px", border: "1px solid #d1d5db", background: "white", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingTask || !newTaskForm.taskName.trim()}
                    style={{ padding: "8px 18px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                  >
                    {addingTask ? "Adding..." : "Add Task"}
                  </button>
                </div>
              </div>
            </form>
          </ModalOverlay>
        )}

        {/* Snapshot Modal */}
        <IncidentImageModal
          isOpen={showImageModal}
          onClose={() => setShowImageModal(false)}
          imageUrl={`/api/control/v1/alerts/${incident.id}/evidence/snapshot`}
          title={incident.title || "Incident Visual Snapshot"}
          cameraName={incident.branchId || "Incident Camera"}
          branchName={incident.branchId}
          timestamp={incident.occurredAt || incident.createdAt}
          severity={incident.severity}
          confidence={incident.aiConfidence}
        />
      </div>
    </AppLayout>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: "#3b82f6",
    "awaiting-verification": "#f59e0b",
    verified: "#10b981",
    assigned: "#6366f1",
    acknowledged: "#8b5cf6",
    "under-investigation": "#ec4899",
    "evidence-collection": "#0284c7",
    escalated: "#dc2626",
    resolved: "#059669",
    closed: "#64748b",
    "false-positive": "#94a3b8",
    cancelled: "#9ca3af",
    reopened: "#ea580c",
  };

  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: "9999px",
        fontSize: "13px",
        fontWeight: 600,
        backgroundColor: colors[status] || "#6b7280",
        color: "white",
        textTransform: "capitalize",
      }}
    >
      {status ? status.replace(/-/g, " ") : "Unknown"}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    P1: "#dc2626",
    P2: "#ea580c",
    P3: "#ca8a04",
    P4: "#2563eb",
    P5: "#64748b",
  };

  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: 700,
        backgroundColor: colors[severity] || "#64748b",
        color: "white",
      }}
    >
      {severity}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        backgroundColor: "#f9fafb",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "15px", fontWeight: 600, color: "#111827" }}>{value}</div>
    </div>
  );
}

function ChecklistPill({
  label,
  status,
  detail,
}: {
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}) {
  const icon =
    status === "pass" ? (
      <CheckCircle2 size={16} color="#16a34a" />
    ) : status === "fail" ? (
      <XCircle size={16} color="#dc2626" />
    ) : (
      <AlertTriangle size={16} color="#d97706" />
    );

  const bg =
    status === "pass" ? "#f0fdf4" : status === "fail" ? "#fef2f2" : "#fffbeb";
  const border =
    status === "pass" ? "#bbf7d0" : status === "fail" ? "#fecaca" : "#fde68a";

  return (
    <div
      style={{
        padding: "10px 14px",
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      {icon}
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#1f2937" }}>{label}</div>
        <div style={{ fontSize: "12px", color: "#4b5563" }}>{detail}</div>
      </div>
    </div>
  );
}
