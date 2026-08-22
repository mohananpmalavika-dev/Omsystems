"use client";

import React, { useState, useEffect } from "react";
import {
  Server,
  Shield,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  XCircle,
  RefreshCw,
  Clock,
  HardDrive,
  Video,
  Radio,
  FileCode,
  Layers,
  ChevronRight,
  Fingerprint,
  Info,
  X,
} from "lucide-react";

export type SupportState = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "UNKNOWN";

export interface CapabilityEvidence {
  source: string;
  probe: string;
  state: SupportState;
  confidence: number;
  observedAt: string;
  latencyMs?: number;
  statusCode?: number;
  reason?: string;
}

export interface RecorderCapability {
  state: SupportState;
  confidence: number;
  preferredApi?: string;
  evidence?: CapabilityEvidence[];
}

export interface RecorderDeviceProfile {
  profileVersion: number;
  recorderId: string;
  tenantId: string;
  branchId: string;
  configuredVendor?: string;
  fingerprint: {
    manufacturer: string;
    model: string;
    firmwareVersion: string;
    serialNumber?: string;
    detectedApiFamilies: {
      onvif: boolean;
      dahuaCgi: boolean;
      hikvisionIsapi: boolean;
      proprietary: boolean;
      rtsp?: boolean;
    };
    capabilities: Record<string, RecorderCapability>;
    confidence: number;
  };
  identityEvidence: Array<{
    source: string;
    manufacturer?: string;
    model?: string;
    firmwareVersion?: string;
    confidence: number;
    observedAt?: string;
  }>;
  apiEvidence: Array<{
    family: string;
    probeId: string;
    confirmed: boolean;
    confidence: number;
    statusCode?: number;
    realm?: string;
    observedAt: string;
  }>;
  preferredApiOrder: string[];
  credentialRef: string;
  firstSeenAt: string;
  lastFingerprintedAt: string;
  nextFingerprintAt: string;
  fingerprintReason: string;
  signature: string;
}

interface RecorderProfileInspectorProps {
  recorderId: string;
  isOpen: boolean;
  onClose: () => void;
  onRefingerprintRequested?: () => void;
}

export function RecorderProfileInspector({
  recorderId,
  isOpen,
  onClose,
  onRefingerprintRequested,
}: RecorderProfileInspectorProps) {
  const [profile, setProfile] = useState<RecorderDeviceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "capabilities" | "apis" | "evidence">("overview");
  const [refingerprinting, setRefingerprinting] = useState(false);
  const [refingerprintReason, setRefingerprintReason] = useState<string>("MANUAL");
  const [showRefingerprintModal, setShowRefingerprintModal] = useState(false);
  const [refingerprintSuccess, setRefingerprintSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && recorderId) {
      loadProfile();
    }
  }, [isOpen, recorderId]);

  async function loadProfile() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/v1/recorders/${encodeURIComponent(recorderId)}/profile`);
      if (!res.ok) {
        throw new Error(`Failed to load recorder profile (${res.status})`);
      }
      const data = await res.json();
      setProfile(data);
    } catch (err: any) {
      setError(err?.message ?? "Error fetching recorder profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleTriggerRefingerprint() {
    try {
      setRefingerprinting(true);
      const res = await fetch(`/v1/recorders/${encodeURIComponent(recorderId)}/refingerprint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: refingerprintReason }),
      });
      if (res.ok) {
        setRefingerprintSuccess("Fingerprinting task queued successfully");
        setShowRefingerprintModal(false);
        setTimeout(() => {
          setRefingerprintSuccess(null);
          loadProfile();
          onRefingerprintRequested?.();
        }, 1500);
      } else {
        throw new Error("Failed to queue re-fingerprint");
      }
    } catch (err: any) {
      alert(`Error triggering re-fingerprint: ${err.message}`);
    } finally {
      setRefingerprinting(false);
    }
  }

  if (!isOpen) return null;

  const fp = profile?.fingerprint;
  const confidencePercent = fp ? Math.round(fp.confidence * 100) : 0;
  const confidenceBadge = getConfidenceBadge(confidencePercent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 rounded-xl border border-blue-500/30 text-blue-400">
              <Fingerprint size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">Recorder Device Profile</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${confidenceBadge.style}`}>
                  {confidencePercent}% {confidenceBadge.label}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                ID: {recorderId} · {fp?.manufacturer ?? "CP PLUS"} {fp?.model ?? "Recorder"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 gap-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-3 border-b-2 transition ${
              activeTab === "overview"
                ? "border-blue-600 text-blue-600 font-semibold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("capabilities")}
            className={`py-3 border-b-2 transition ${
              activeTab === "capabilities"
                ? "border-blue-600 text-blue-600 font-semibold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Capabilities Matrix
          </button>
          <button
            onClick={() => setActiveTab("apis")}
            className={`py-3 border-b-2 transition ${
              activeTab === "apis"
                ? "border-blue-600 text-blue-600 font-semibold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Detected Protocols
          </button>
          <button
            onClick={() => setActiveTab("evidence")}
            className={`py-3 border-b-2 transition ${
              activeTab === "evidence"
                ? "border-blue-600 text-blue-600 font-semibold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Diagnostic Evidence
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
              <RefreshCw className="animate-spin text-blue-600" size={32} />
              <p className="text-sm">Reading device profile & telemetry evidence...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
              <AlertTriangle size={20} />
              <span>{error}</span>
            </div>
          )}

          {refingerprintSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-3">
              <CheckCircle2 size={20} />
              <span>{refingerprintSuccess}</span>
            </div>
          )}

          {!loading && profile && (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Identity Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Manufacturer</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">{fp?.manufacturer || "CP PLUS"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Configured: {profile.configuredVendor || "cp-plus"}</p>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Model & SKU</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">{fp?.model || "Unknown"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Serial: {fp?.serialNumber || "N/A"}</p>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Firmware Version</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">{fp?.firmwareVersion || "Unknown"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Profile v{profile.profileVersion}</p>
                    </div>
                  </div>

                  {/* Fingerprint Metadata Card */}
                  <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                        <Fingerprint size={16} className="text-blue-600" />
                        Device Signature & Operational Schedule
                      </h4>
                      <button
                        onClick={() => setShowRefingerprintModal(true)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <RefreshCw size={12} />
                        Re-Fingerprint
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-600 pt-2 border-t border-blue-100">
                      <div>
                        <span className="text-slate-400 block">Last Fingerprinted</span>
                        <strong className="text-slate-800">{new Date(profile.lastFingerprintedAt).toLocaleString()}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Next Refresh</span>
                        <strong className="text-slate-800">{profile.nextFingerprintAt ? new Date(profile.nextFingerprintAt).toLocaleDateString() : "Scheduled"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Trigger Reason</span>
                        <strong className="text-slate-800">{profile.fingerprintReason}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Signature Hash</span>
                        <code className="text-[10px] bg-white px-1 py-0.5 rounded border border-blue-200 text-slate-700 truncate block max-w-[140px]">
                          {profile.signature.slice(0, 16)}...
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Protocol Routing Summary */}
                  <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <Layers size={16} className="text-slate-600" />
                      Dynamic Capability-Aware Routing Order
                    </h4>
                    <p className="text-xs text-slate-600">
                      Operations are dynamically routed based on capability evidence rather than a static vendor alias.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {profile.preferredApiOrder.map((api, idx) => (
                        <div key={api} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-800">
                          <span className="w-4 h-4 rounded-full bg-slate-300 text-slate-700 text-[10px] flex items-center justify-center font-bold">
                            {idx + 1}
                          </span>
                          <span>{api.replace("_", " ")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CAPABILITIES MATRIX */}
              {activeTab === "capabilities" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
                    <span>Evaluated against 10 operational recorder capabilities</span>
                    <span className="italic">Evidence-backed negative assertions enforced</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(fp?.capabilities ?? {}).map(([key, cap]) => {
                      const stateBadge = getStateBadge(cap.state);
                      return (
                        <div
                          key={key}
                          className="p-4 border border-slate-200 rounded-xl bg-white hover:border-blue-200 transition space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-slate-900 capitalize">
                              {formatCapabilityName(key)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${stateBadge.style}`}>
                              {cap.state}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                            <span>Preferred API: <strong className="text-slate-700">{cap.preferredApi || "AUTO"}</strong></span>
                            <span>Confidence: <strong className="text-slate-700">{Math.round(cap.confidence * 100)}%</strong></span>
                          </div>
                          {key === "smartTelemetry" && cap.state === "PARTIAL" && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                              Storage disk exists, but deep S.M.A.R.T. attributes are partial/unverified. Telemetry will not falsely claim healthy.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: DETECTED PROTOCOLS */}
              {activeTab === "apis" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ApiFamilyCard
                      title="Dahua CGI / CP PLUS OEM"
                      description="MagicBox, ConfigManager, and StorageDevice CGI endpoints"
                      detected={Boolean(fp?.detectedApiFamilies.dahuaCgi)}
                      confidence={fp?.detectedApiFamilies.dahuaCgi ? 97 : 10}
                    />
                    <ApiFamilyCard
                      title="ONVIF Core & Media"
                      description="GetDeviceInformation, GetCapabilities, and GetProfiles SOAP services"
                      detected={Boolean(fp?.detectedApiFamilies.onvif)}
                      confidence={fp?.detectedApiFamilies.onvif ? 95 : 10}
                    />
                    <ApiFamilyCard
                      title="Hikvision ISAPI"
                      description="XML SystemDeviceInfo and ContentMgmt Storage endpoints"
                      detected={Boolean(fp?.detectedApiFamilies.hikvisionIsapi)}
                      confidence={fp?.detectedApiFamilies.hikvisionIsapi ? 96 : 5}
                    />
                    <ApiFamilyCard
                      title="RTSP Media Pipeline"
                      description="Direct RTSP DESCRIBE and H.264/H.265 track validation"
                      detected={Boolean(fp?.detectedApiFamilies.rtsp)}
                      confidence={fp?.detectedApiFamilies.rtsp ? 90 : 20}
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: DIAGNOSTIC EVIDENCE */}
              {activeTab === "evidence" && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                    <Shield size={16} className="text-emerald-600" />
                    <span>All authorization headers, credentials, passwords, and sensitive nonces have been redacted.</span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                        <tr>
                          <th className="p-3">Protocol / Family</th>
                          <th className="p-3">Probe Name</th>
                          <th className="p-3">Status Code</th>
                          <th className="p-3">Confidence</th>
                          <th className="p-3">Observed At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {profile.apiEvidence.map((ev, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-3 font-semibold text-slate-900">{ev.family}</td>
                            <td className="p-3 text-slate-600 font-mono text-[11px]">{ev.probeId}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${ev.statusCode === 200 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                                {ev.statusCode ?? (ev.confirmed ? "200 OK" : "N/A")}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-slate-700">{Math.round(ev.confidence * 100)}%</td>
                            <td className="p-3 text-slate-500">{new Date(ev.observedAt).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info size={14} />
            <span>Profile version {profile?.profileVersion ?? 1} · Generated by Sentinel Edge Agent</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Re-Fingerprint Modal */}
      {showRefingerprintModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Trigger Re-Fingerprint</h3>
              <button onClick={() => setShowRefingerprintModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Select reason for re-probing recorder <strong>{recorderId}</strong>. A read-only staged discovery will run on the assigned edge agent.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">Reason</label>
              <select
                value={refingerprintReason}
                onChange={(e) => setRefingerprintReason(e.target.value)}
                className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="MANUAL">Manual operator request</option>
                <option value="FIRMWARE_CHANGE">Firmware upgrade</option>
                <option value="SCHEDULED">Scheduled maintenance refresh</option>
                <option value="FAILURE_DRIFT">Adapter failure / Protocol drift</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRefingerprintModal(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerRefingerprint}
                disabled={refingerprinting}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1.5"
              >
                {refingerprinting ? <RefreshCw className="animate-spin" size={13} /> : null}
                Run Fingerprint
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiFamilyCard({
  title,
  description,
  detected,
  confidence,
}: {
  title: string;
  description: string;
  detected: boolean;
  confidence: number;
}) {
  return (
    <div className={`p-4 rounded-xl border transition ${detected ? "bg-emerald-50/50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm text-slate-900">{title}</h4>
        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${detected ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
          {detected ? "DETECTED" : "NOT DETECTED"}
        </span>
      </div>
      <p className="text-xs text-slate-600 mt-1">{description}</p>
      <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
        <span className="text-slate-500">Confidence</span>
        <strong className={detected ? "text-emerald-800" : "text-slate-600"}>{confidence}%</strong>
      </div>
    </div>
  );
}

function getConfidenceBadge(confidence: number) {
  if (confidence >= 85) return { label: "CONFIRMED", style: "bg-emerald-500 text-white" };
  if (confidence >= 60) return { label: "USABLE", style: "bg-blue-500 text-white" };
  if (confidence >= 30) return { label: "TENTATIVE", style: "bg-amber-500 text-white" };
  return { label: "UNKNOWN", style: "bg-slate-500 text-white" };
}

function getStateBadge(state: SupportState) {
  switch (state) {
    case "SUPPORTED":
      return { style: "bg-emerald-100 text-emerald-800 border border-emerald-200" };
    case "PARTIAL":
      return { style: "bg-amber-100 text-amber-800 border border-amber-200" };
    case "UNSUPPORTED":
      return { style: "bg-red-100 text-red-800 border border-red-200" };
    case "UNKNOWN":
    default:
      return { style: "bg-slate-100 text-slate-700 border border-slate-200" };
  }
}

function formatCapabilityName(key: string): string {
  switch (key) {
    case "deviceInfo": return "Device Information";
    case "channels": return "Channel Inventory";
    case "liveStream": return "Live RTSP Streaming";
    case "recordingStatus": return "Recording Status Telemetry";
    case "playbackSearch": return "Playback Archive Search";
    case "storageStatus": return "Storage & Disks";
    case "smartTelemetry": return "HDD S.M.A.R.T. Telemetry";
    case "deviceTime": return "Device Clock & NTP";
    case "events": return "Event Notifications";
    case "ptz": return "PTZ Telemetry & Control";
    default: return key;
  }
}
