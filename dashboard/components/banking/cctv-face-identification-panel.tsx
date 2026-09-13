"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Camera,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  UserX,
  Clock,
  ScanFace,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  RefreshCw,
  Video,
  Radio,
  Eye,
} from "lucide-react";
import { secureAreaAuthorizationApi, cameraInventoryApi } from "@/lib/api-client";

interface CameraOption {
  id: string;
  name?: string;
  model?: string;
  [key: string]: any;
}

interface CctvFaceIdentificationPanelProps {
  branchId: string;
  locationId?: string;
  persons: any[];
  assignments: any[];
  onRefreshNeeded: () => Promise<void>;
}

export function CctvFaceIdentificationPanel({
  branchId,
  locationId,
  persons,
  assignments,
  onRefreshNeeded,
}: CctvFaceIdentificationPanelProps) {
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [cctvEvents, setCctvEvents] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [alertsOnly, setAlertsOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [identifying, setIdentifying] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Live HUD State
  const [lastVerdict, setLastVerdict] = useState<any | null>(null);
  const [hudActive, setHudActive] = useState<boolean>(false);

  // Face Enrollment Modal State
  const [enrollingPerson, setEnrollingPerson] = useState<any | null>(null);
  const [enrollPhotoPreview, setEnrollPhotoPreview] = useState<string>("");
  const [enrollingBusy, setEnrollingBusy] = useState<boolean>(false);

  // New Camera Mapping Form
  const [newCamId, setNewCamId] = useState<string>("");
  const [newAreaType, setNewAreaType] = useState<"cash_counter" | "locker">("cash_counter");
  const [newAreaName, setNewAreaName] = useState<string>("");
  const [newNotes, setNewNotes] = useState<string>("");
  const [mappingBusy, setMappingBusy] = useState<boolean>(false);

  // Load available cameras and camera mappings for this branch
  const loadData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [camsRes, mappingsRes, eventsRes] = await Promise.all([
        cameraInventoryApi.listByBranch(branchId, "analytics:view").catch(() => ({ data: [] })),
        secureAreaAuthorizationApi.listCameraMappings({ branchId }),
        secureAreaAuthorizationApi.listCctvEvents({ branchId, alertsOnly, limit: 25 }),
      ]);
      const camList = (camsRes.data ?? []) as CameraOption[];
      setCameras(camList);
      setMappings(mappingsRes.data ?? []);
      setCctvEvents(eventsRes.data ?? []);

      if (mappingsRes.data?.length > 0 && !selectedCameraId) {
        setSelectedCameraId(mappingsRes.data[0].cameraId);
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to load CCTV data" });
    } finally {
      setLoading(false);
    }
  }, [branchId, alertsOnly, selectedCameraId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Currently active mapping for the live HUD
  const activeMapping = useMemo(() => {
    return mappings.find((m) => m.cameraId === selectedCameraId) ?? mappings[0] ?? null;
  }, [mappings, selectedCameraId]);

  // Today's authorized person for this counter/locker
  const assignedPerson = useMemo(() => {
    if (!activeMapping) return null;
    return (
      assignments.find(
        (a) =>
          a.areaType === activeMapping.areaType &&
          a.areaName.toLowerCase().trim() === activeMapping.areaName.toLowerCase().trim(),
      ) ?? null
    );
  }, [activeMapping, assignments]);

  // Execute CCTV Identification
  const handleIdentify = async (scenario: "assigned" | "unauthorized_staff" | "unknown" | "after_hours") => {
    if (!activeMapping) {
      setStatusMessage({ type: "error", text: "Please map and select a CCTV camera first." });
      return;
    }
    setIdentifying(true);
    setHudActive(true);
    try {
      let facePersonId: string | undefined = undefined;
      let detectedAt: string | undefined = undefined;
      let simScore = 0.95;

      if (scenario === "assigned") {
        if (!assignedPerson) {
          throw new Error(`No staff member is currently assigned to ${activeMapping.areaName}. Assign a teller/custodian first.`);
        }
        const personRecord = persons.find((p) => p.id === assignedPerson.personId || p.fullName === assignedPerson.fullName);
        facePersonId = personRecord?.facePersonId || personRecord?.id;
        simScore = 0.98;
      } else if (scenario === "unauthorized_staff") {
        // Find another person from the roster who is NOT assigned here
        const otherStaff = persons.find((p) => p.id !== assignedPerson?.personId);
        if (!otherStaff) {
          throw new Error("Please register at least two staff members to test unauthorized staff detection.");
        }
        facePersonId = otherStaff.facePersonId || otherStaff.id;
        simScore = 0.94;
      } else if (scenario === "unknown") {
        facePersonId = undefined; // Unrecognized outsider
        simScore = 0.42;
      } else if (scenario === "after_hours") {
        facePersonId = persons[0]?.facePersonId || persons[0]?.id;
        detectedAt = "2026-09-15T23:30:00+05:30"; // Night time breach
        simScore = 0.92;
      }

      const res = await secureAreaAuthorizationApi.cctvIdentify({
        cameraId: activeMapping.cameraId,
        facePersonId,
        similarityScore: simScore,
        detectedAt,
        faceBbox: { x: 180, y: 120, width: 160, height: 190 },
      });

      setLastVerdict(res.data);
      setStatusMessage({
        type: res.data.alertTriggered ? "error" : "success",
        text: res.data.notes,
      });

      // Reload event feed
      const eventsRes = await secureAreaAuthorizationApi.listCctvEvents({ branchId, alertsOnly, limit: 25 });
      setCctvEvents(eventsRes.data ?? []);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Identification failed" });
    } finally {
      setIdentifying(false);
    }
  };

  // Face Enrollment Handler
  const handleEnrollFace = async () => {
    if (!enrollingPerson) return;
    setEnrollingBusy(true);
    try {
      await secureAreaAuthorizationApi.enrollFace(enrollingPerson.id, {
        photoBase64: enrollPhotoPreview || "sample_face_biometric_data",
      });
      setStatusMessage({
        type: "success",
        text: `Face biometrics enrolled successfully for ${enrollingPerson.fullName}.`,
      });
      setEnrollingPerson(null);
      setEnrollPhotoPreview("");
      await onRefreshNeeded();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Face enrollment failed" });
    } finally {
      setEnrollingBusy(false);
    }
  };

  // Create Camera Mapping
  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCamId || !newAreaName) return;
    setMappingBusy(true);
    try {
      await secureAreaAuthorizationApi.createCameraMapping({
        branchId,
        locationId,
        cameraId: newCamId,
        areaType: newAreaType,
        areaName: newAreaName,
        notes: newNotes || undefined,
      });
      setStatusMessage({ type: "success", text: `Camera ${newCamId} mapped to ${newAreaName}.` });
      setNewCamId("");
      setNewAreaName("");
      setNewNotes("");
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to create camera mapping" });
    } finally {
      setMappingBusy(false);
    }
  };

  // Delete Camera Mapping
  const handleDeleteMapping = async (mappingId: string) => {
    if (!confirm("Are you sure you want to unmap this CCTV camera?")) return;
    try {
      await secureAreaAuthorizationApi.deleteCameraMapping(mappingId);
      setStatusMessage({ type: "success", text: "Camera unmapped successfully." });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to unmap camera" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {statusMessage && (
        <div
          className={`flex items-center justify-between rounded-xl border p-4 text-sm ${
            statusMessage.type === "success"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
              : "border-rose-500/30 bg-rose-950/40 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-3">
            {statusMessage.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. CCTV LIVE IDENTIFICATION HUD & SIMULATION CONTROLS */}
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <ScanFace size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-100">CCTV Face Recognition Identification</h2>
              <p className="text-xs text-slate-400">
                Live facial detection & authorization matching for Bank Lockers and Cash Counters
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <Camera size={15} className="text-cyan-400" />
              <span>Target CCTV Camera:</span>
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  setLastVerdict(null);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                {mappings.length === 0 ? (
                  <option value="">No mapped cameras</option>
                ) : (
                  mappings.map((m) => (
                    <option key={m.id} value={m.cameraId}>
                      {m.cameraId} ({m.areaType === "cash_counter" ? "Cash" : "Locker"}: {m.areaName})
                    </option>
                  ))
                )}
              </select>
            </label>

            <button
              onClick={() => void loadData()}
              className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700"
              title="Refresh CCTV Status"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-12">
          {/* Simulated CCTV Stream Canvas */}
          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-black min-h-[380px] lg:col-span-8">
            {/* Top Stream Overlay */}
            <div className="relative z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-md bg-rose-600/80 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                  <Radio size={12} className="animate-pulse" /> LIVE
                </span>
                <span className="font-mono text-xs text-slate-300">
                  {activeMapping?.cameraId ?? "CAM-OFFLINE"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    activeMapping?.areaType === "locker"
                      ? "bg-purple-900/60 text-purple-300 border border-purple-500/30"
                      : "bg-emerald-900/60 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {activeMapping ? (activeMapping.areaType === "locker" ? "🔒 Locker Vault" : "💵 Cash Counter") : "Unassigned"}
                </span>
                <span className="font-mono text-xs text-slate-400">
                  {new Date().toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* Simulated Frame Background with Target Grids */}
            <div className="absolute inset-0 flex items-center justify-center opacity-40">
              <div className="h-64 w-64 rounded-full border border-dashed border-cyan-500/30 animate-[spin_30s_linear_infinite]" />
              <div className="absolute h-48 w-48 rounded-full border border-cyan-500/20" />
            </div>

            {/* Face Detection Bounding Box HUD */}
            {hudActive && lastVerdict && (
              <div className="relative z-10 mx-auto my-auto flex flex-col items-center">
                <div
                  className={`relative flex h-52 w-44 flex-col justify-between rounded-xl border-2 p-2.5 transition-all duration-300 ${
                    lastVerdict.verdict === "authorized"
                      ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_30px_rgba(52,211,153,0.3)]"
                      : lastVerdict.verdict === "unauthorized_staff"
                      ? "border-amber-400 bg-amber-500/10 shadow-[0_0_30px_rgba(251,191,36,0.3)]"
                      : "border-rose-500 bg-rose-500/15 shadow-[0_0_35px_rgba(244,63,94,0.4)] animate-pulse"
                  }`}
                >
                  {/* Corner Reticles */}
                  <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-inherit" />
                  <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-inherit" />
                  <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-inherit" />
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-inherit" />

                  {/* Header Badge */}
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                    <span
                      className={`rounded px-1.5 py-0.5 text-white ${
                        lastVerdict.verdict === "authorized"
                          ? "bg-emerald-600"
                          : lastVerdict.verdict === "unauthorized_staff"
                          ? "bg-amber-600"
                          : "bg-rose-600"
                      }`}
                    >
                      {lastVerdict.verdict.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-slate-200">
                      {Math.round((lastVerdict.similarityScore || 0.95) * 100)}% Match
                    </span>
                  </div>

                  {/* Center Face Icon / Avatar Placeholder */}
                  <div className="grid place-items-center py-2">
                    <ScanFace
                      size={44}
                      className={
                        lastVerdict.verdict === "authorized"
                          ? "text-emerald-300"
                          : lastVerdict.verdict === "unauthorized_staff"
                          ? "text-amber-300"
                          : "text-rose-400"
                      }
                    />
                  </div>

                  {/* Footer Name / Details */}
                  <div className="rounded bg-black/75 p-1.5 text-center backdrop-blur-sm">
                    <p className="truncate text-xs font-bold text-white">
                      {lastVerdict.person?.fullName || "Unrecognized Person"}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {lastVerdict.person?.employeeCode
                        ? `ID: ${lastVerdict.person.employeeCode}`
                        : "No Match in Roster"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!hudActive && (
              <div className="relative z-10 m-auto text-center">
                <Video size={42} className="mx-auto text-slate-600" />
                <p className="mt-2 text-sm font-medium text-slate-400">CCTV Camera Ready</p>
                <p className="text-xs text-slate-600">Select a scenario below to test identification</p>
              </div>
            )}

            {/* Bottom Stream Status */}
            <div className="relative z-10 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent p-4">
              <div className="text-xs">
                <span className="text-slate-400">Target Area: </span>
                <span className="font-semibold text-white">
                  {activeMapping?.areaName || "Not Selected"}
                </span>
              </div>
              <div className="text-xs">
                <span className="text-slate-400">Assigned Today: </span>
                <span className="font-semibold text-emerald-400">
                  {assignedPerson ? `${assignedPerson.fullName} (${assignedPerson.employeeCode})` : "None"}
                </span>
              </div>
            </div>
          </div>

          {/* Identification Simulator Controls */}
          <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 lg:col-span-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Radio size={16} className="text-cyan-400" /> Live Verification Triggers
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Simulate facial recognition inference directly on this CCTV channel:
              </p>

              <div className="mt-4 space-y-2.5">
                {/* 1. Assigned Teller / Custodian */}
                <button
                  onClick={() => void handleIdentify("assigned")}
                  disabled={identifying || !activeMapping}
                  className="flex w-full items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-left transition hover:bg-emerald-900/40 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400">
                      <UserCheck size={18} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-emerald-300">Verify Assigned Staff</p>
                      <p className="text-[11px] text-slate-400">
                        {assignedPerson ? assignedPerson.fullName : "Needs assignment"}
                      </p>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    PASS
                  </span>
                </button>

                {/* 2. Unauthorized Staff Member */}
                <button
                  onClick={() => void handleIdentify("unauthorized_staff")}
                  disabled={identifying || !activeMapping}
                  className="flex w-full items-center justify-between rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-left transition hover:bg-amber-900/40 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/20 text-amber-400">
                      <UserX size={18} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-amber-300">Detect Unassigned Staff</p>
                      <p className="text-[11px] text-slate-400">Employee at wrong counter/vault</p>
                    </div>
                  </div>
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    ALERT P2
                  </span>
                </button>

                {/* 3. Unrecognized Intruder */}
                <button
                  onClick={() => void handleIdentify("unknown")}
                  disabled={identifying || !activeMapping}
                  className="flex w-full items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-left transition hover:bg-rose-900/40 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-500/20 text-rose-400">
                      <AlertTriangle size={18} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-rose-300">Detect Unknown Intruder</p>
                      <p className="text-[11px] text-slate-400">Stranger behind counter/locker</p>
                    </div>
                  </div>
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                    BREACH
                  </span>
                </button>

                {/* 4. After-Hours Breach */}
                <button
                  onClick={() => void handleIdentify("after_hours")}
                  disabled={identifying || !activeMapping}
                  className="flex w-full items-center justify-between rounded-xl border border-purple-500/30 bg-purple-950/30 p-3 text-left transition hover:bg-purple-900/40 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/20 text-purple-400">
                      <Clock size={18} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-purple-300">After-Hours Vault Breach</p>
                      <p className="text-[11px] text-slate-400">Detection outside operating hours</p>
                    </div>
                  </div>
                  <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                    P1 CRITICAL
                  </span>
                </button>
              </div>
            </div>

            {/* Summary Box */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs">
              <p className="font-semibold text-slate-300">Banking Security Policy</p>
              <p className="mt-1 text-slate-400">
                Operating hours: 09:00 - 18:00 IST. Locker vault incurs high-priority (P1) escalation.
                Cash counters trigger cashier displacement alerts (P2).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CAMERA MAPPING MANAGEMENT & STAFF FACE BIOMETRIC ENROLLMENT */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Camera Mapping Form & List */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-100">
              <Camera size={18} className="text-cyan-400" /> CCTV Camera Mapping
            </h3>
            <span className="text-xs text-slate-400">{mappings.length} cameras mapped</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Link high-definition CCTV streams to physical Cash Counters or Locker Strongrooms.
          </p>

          <form onSubmit={handleCreateMapping} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-300">
              Camera ID / Stream
              <select
                required
                value={newCamId}
                onChange={(e) => setNewCamId(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Select camera...</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id} ({c.model || "IP Camera"})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-300">
              Secure Area Type
              <select
                value={newAreaType}
                onChange={(e) => setNewAreaType(e.target.value as "cash_counter" | "locker")}
                className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="cash_counter">Cash Counter</option>
                <option value="locker">Locker Strongroom</option>
              </select>
            </label>

            <label className="text-xs font-medium text-slate-300">
              Area / Counter Name
              <input
                required
                placeholder="e.g. Cash Counter 01, Strongroom 1"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </label>

            <label className="text-xs font-medium text-slate-300">
              Position Notes
              <input
                placeholder="e.g. Overhead Teller Tray View"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={mappingBusy || !newCamId || !newAreaName}
              className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 py-2.5 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:opacity-40 sm:col-span-2"
            >
              <Plus size={15} /> {mappingBusy ? "Mapping..." : "Map Camera to Secure Area"}
            </button>
          </form>

          {/* Mappings Table */}
          <div className="mt-5 max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
            {mappings.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">No cameras mapped yet.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                  <tr>
                    <th className="p-3">Camera</th>
                    <th className="p-3">Zone Type</th>
                    <th className="p-3">Zone Name</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {mappings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-900/40">
                      <td className="p-3 font-mono text-slate-300">{m.cameraId}</td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                            m.areaType === "locker"
                              ? "bg-purple-500/20 text-purple-300"
                              : "bg-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          {m.areaType === "cash_counter" ? "Cash Counter" : "Locker"}
                        </span>
                      </td>
                      <td className="p-3 text-slate-200">{m.areaName}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => void handleDeleteMapping(m.id)}
                          className="rounded p-1 text-slate-400 hover:text-rose-400"
                          title="Unmap"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Staff Biometric Face Enrollment Status */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-100">
              <ScanFace size={18} className="text-emerald-400" /> Staff Face Biometrics
            </h3>
            <span className="text-xs text-slate-400">{persons.length} staff registered</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Enroll facial biometric photos for tellers and vault custodians for CCTV matching.
          </p>

          <div className="mt-4 max-h-[340px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
            {persons.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">
                No authorized staff registered yet. Register staff in the form above first.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                  <tr>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Designation</th>
                    <th className="p-3">Face Status</th>
                    <th className="p-3 text-right">Biometrics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {persons.map((p) => {
                    const isEnrolled = Boolean(p.facePersonId);
                    return (
                      <tr key={p.id} className="hover:bg-slate-900/40">
                        <td className="p-3">
                          <p className="font-semibold text-slate-200">{p.fullName}</p>
                          <p className="font-mono text-[10px] text-slate-500">{p.employeeCode}</p>
                        </td>
                        <td className="p-3 text-slate-400">{p.designation || "Staff"}</td>
                        <td className="p-3">
                          {isEnrolled ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                              <CheckCircle2 size={12} /> Enrolled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                              <AlertTriangle size={12} /> Pending
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setEnrollingPerson(p);
                              setEnrollPhotoPreview("");
                            }}
                            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:border-emerald-500/50 hover:bg-emerald-950/40 hover:text-emerald-300"
                          >
                            {isEnrolled ? "Update Face" : "Enroll Face"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* 3. CCTV AUDIT LOG & BREACH EVENTS */}
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-100">
              <Eye size={18} className="text-cyan-400" /> CCTV Face Verification Audit Trail
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Complete chronological ledger of facial recognitions, teller matches, and intrusion alerts
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAlertsOnly(!alertsOnly)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                alertsOnly
                  ? "border-rose-500/40 bg-rose-500/20 text-rose-300"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {alertsOnly ? "⚠️ Showing Security Alerts Only" : "Showing All Events"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {cctvEvents.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">No CCTV face events recorded yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Camera</th>
                  <th className="p-3">Secure Area</th>
                  <th className="p-3">Verdict</th>
                  <th className="p-3">Detected Identity</th>
                  <th className="p-3">Confidence</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {cctvEvents.map((evt) => {
                  const isAuth = evt.verdict === "authorized";
                  const isStaffAlert = evt.verdict === "unauthorized_staff";
                  return (
                    <tr key={evt.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono text-slate-400">
                        {new Date(evt.occurredAt).toLocaleString()}
                      </td>
                      <td className="p-3 font-mono text-slate-300">{evt.cameraId}</td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-200">{evt.areaName}</span>
                        <span className="ml-1 text-[10px] text-slate-500">
                          ({evt.areaType === "cash_counter" ? "Cash" : "Locker"})
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            isAuth
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : isStaffAlert
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse"
                          }`}
                        >
                          {evt.verdict.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3">
                        {evt.personName ? (
                          <div>
                            <span className="font-semibold text-slate-200">{evt.personName}</span>
                            {evt.employeeCode && (
                              <span className="ml-1 text-[10px] text-slate-500 font-mono">
                                ({evt.employeeCode})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unidentified</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {evt.similarityScore ? `${Math.round(evt.similarityScore * 100)}%` : "—"}
                      </td>
                      <td className="p-3 text-slate-400 max-w-xs truncate">{evt.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 4. FACE ENROLLMENT MODAL */}
      {enrollingPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <ScanFace size={20} />
                </span>
                <div>
                  <h4 className="text-base font-bold text-white">Enroll Staff Face Biometrics</h4>
                  <p className="text-xs text-slate-400">{enrollingPerson.fullName} ({enrollingPerson.employeeCode})</p>
                </div>
              </div>
              <button
                onClick={() => setEnrollingPerson(null)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="my-6 space-y-4">
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950 p-6 text-center">
                {enrollPhotoPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={enrollPhotoPreview}
                      alt="Enrolled preview"
                      className="h-36 w-36 rounded-full object-cover border-2 border-emerald-400 shadow-md"
                    />
                    <button
                      onClick={() => setEnrollPhotoPreview("")}
                      className="absolute -top-2 -right-2 rounded-full bg-rose-600 p-1 text-white hover:bg-rose-500"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <UploadCloud size={36} className="text-slate-500" />
                    <p className="mt-2 text-xs font-semibold text-slate-300">
                      Upload Passport / ID Photo
                    </p>
                    <p className="text-[10px] text-slate-500">
                      JPEG or PNG format with clear face visibility
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setEnrollPhotoPreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="mt-3 block w-full text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-xs file:text-slate-200 hover:file:bg-slate-700"
                    />
                  </>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-400">
                <p className="font-semibold text-slate-300">Bank Compliance Notice</p>
                Biometric templates are cryptographically signed and stored in accordance with RBI cyber security guidelines for high-value transactional zones.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setEnrollingPerson(null)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={enrollingBusy}
                onClick={handleEnrollFace}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                <ShieldCheck size={16} />
                {enrollingBusy ? "Generating Embedding..." : "Confirm & Enroll Face"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
