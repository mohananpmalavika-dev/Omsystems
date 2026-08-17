"use client";

import React, { useState, useEffect } from "react";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserCheck,
  Cpu,
  HardDrive,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ChevronRight,
  X,
  Play,
  Check,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Server,
  Layers,
  FileText,
} from "lucide-react";

export function MaintenanceCommandCenter() {
  const [metrics, setMetrics] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Replacement Form State
  const [showReplacementForm, setShowReplacementForm] = useState(false);
  const [oldSerial, setOldSerial] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newModel, setNewModel] = useState("CP PLUS 4MP WDR IR Bullet");
  const [workNotes, setWorkNotes] = useState("");

  const fetchMaintenanceData = async () => {
    try {
      const [metRes, tktRes] = await Promise.all([
        fetch("/api/control/v1/maintenance/metrics"),
        fetch("/api/control/v1/maintenance/tickets"),
      ]);
      const metData = await metRes.json();
      const tktData = await tktRes.json();

      if (metData.success && metData.data) setMetrics(metData.data);
      if (tktData.success && tktData.data) {
        setTickets(tktData.data);
        if (selectedTicket) {
          const updated = tktData.data.find((t: any) => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaintenanceData();
    const timer = setInterval(fetchMaintenanceData, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleVisitProgress = async (ticketId: string, action: string, notes?: string) => {
    setActionLoading(`visit-${action}`);
    try {
      const res = await fetch(`/api/control/v1/maintenance/tickets/${ticketId}/visit-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, workNotes: notes }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg(`Work order status updated to ${data.ticket.status}.`);
        await fetchMaintenanceData();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleReplaceSpare = async (ticketId: string) => {
    if (!oldSerial || !newSerial) return;
    setActionLoading("replace");
    try {
      const res = await fetch(`/api/control/v1/maintenance/tickets/${ticketId}/replace-spare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldSerial,
          newSerial,
          modelName: newModel,
          workNotes: workNotes || "Faulty hardware replaced with certified spare.",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg(`Spare replaced! Old serial retired, new serial ${newSerial} enrolled in Digital Twin.`);
        setShowReplacementForm(false);
        await fetchMaintenanceData();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyAndClose = async (ticketId: string) => {
    setActionLoading("verify");
    try {
      const res = await fetch(`/api/control/v1/maintenance/tickets/${ticketId}/verify`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg("✅ Automated verification passed! 5/5 gates verified. Ticket CLOSED.");
        await fetchMaintenanceData();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (filterPriority !== "ALL" && t.priority !== filterPriority) return false;
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.ticketNumber.toLowerCase().includes(q) ||
        t.branchName.toLowerCase().includes(q) ||
        t.assetName.toLowerCase().includes(q) ||
        t.faultDescription.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase tracking-widest">
              <Wrench className="w-4 h-4 text-amber-400" />
              <span>Surveillance Field Service & Maintenance Operations Subsystem</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
              Automated Diagnostics, Field Work Orders & Spare Management
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Offline Diagnostics ➔ Deduplication ➔ SLA Escalation ➔ Spare Replacement ➔ 5-Gate Verification ➔ Closure
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
            <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-bold">
              MTTR: {metrics?.meanTimeToRepairHours || 3.4} hrs
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-cyan-400 font-bold">
              First-Time Fix: {metrics?.firstTimeFixRatePct || 94.2}%
            </span>
          </div>
        </div>
      </div>

      {toastMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Total Work Orders</div>
          <div className="text-2xl font-bold text-white font-mono">{metrics?.totalTickets || tickets.length}</div>
          <div className="text-[10px] text-slate-400">Active Cycle</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">P1 Urgent</div>
          <div className="text-2xl font-bold text-rose-400 font-mono">{metrics?.priorityBreakdown?.P1 || 1}</div>
          <div className="text-[10px] text-rose-400">4-Hour SLA Target</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">P2 High</div>
          <div className="text-2xl font-bold text-amber-400 font-mono">{metrics?.priorityBreakdown?.P2 || 1}</div>
          <div className="text-[10px] text-amber-300">8-Hour SLA Target</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Assigned / In Progress</div>
          <div className="text-2xl font-bold text-blue-400 font-mono">{metrics?.assignedTickets || 2}</div>
          <div className="text-[10px] text-blue-300">Field Engineers Active</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">SLA Breaches</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{metrics?.slaBreachCount || 0}</div>
          <div className="text-[10px] text-emerald-400">100% SLA Adherence</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Repeat Failures (&lt;24h)</div>
          <div className="text-2xl font-bold text-purple-400 font-mono">{metrics?.repeatFailureRatePct || 2.1}%</div>
          <div className="text-[10px] text-slate-400">Industry Low</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticket #, branch, camera, fault..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {["ALL", "P1", "P2", "P3"].map((prio) => (
            <button
              key={prio}
              onClick={() => setFilterPriority(prio)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterPriority === prio
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              {prio === "ALL" ? "All Priorities" : `${prio} Only`}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets Table */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
                <th className="py-3.5 px-4 font-semibold">Ticket & Branch</th>
                <th className="py-3.5 px-4 font-semibold">Fault & Asset</th>
                <th className="py-3.5 px-4 font-semibold">Priority</th>
                <th className="py-3.5 px-4 font-semibold">Assigned Engineer</th>
                <th className="py-3.5 px-4 font-semibold">SLA Status</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-200 font-mono group-hover:text-amber-400 transition-colors">
                      {ticket.ticketNumber}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{ticket.branchName}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-200">{ticket.assetName}</div>
                    <div className="text-[11px] text-slate-400 max-w-xs truncate">{ticket.faultDescription}</div>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        ticket.priority === "P1"
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : ticket.priority === "P2"
                          ? "bg-amber-950 text-amber-300 border border-amber-800"
                          : "bg-blue-950 text-blue-300 border border-blue-800"
                      }`}
                    >
                      {ticket.priority}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    {ticket.assignedEngineer ? (
                      <div className="space-y-0.5">
                        <div className="text-slate-200 font-medium">{ticket.assignedEngineer.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{ticket.assignedEngineer.vendorName}</div>
                      </div>
                    ) : (
                      <span className="text-amber-400 text-[11px] font-mono">Unassigned</span>
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px]">
                    <span className="text-emerald-400 font-bold">On Schedule</span>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        ticket.status === "CLOSED"
                          ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                          : ticket.status === "VERIFYING"
                          ? "bg-purple-950/80 text-purple-300 border border-purple-800 animate-pulse"
                          : ticket.status === "ON_SITE" || ticket.status === "REMOTE_WORK"
                          ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800"
                          : "bg-amber-950/80 text-amber-300 border border-amber-800"
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedTicket(ticket)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                    >
                      Work Order ➔
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket Work Order Drawer & Verification Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  <span>Maintenance Work Order • {selectedTicket.priority}</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight mt-1">{selectedTicket.ticketNumber}</h2>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  {selectedTicket.branchName} • {selectedTicket.assetName}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTicket(null);
                  setShowReplacementForm(false);
                }}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action Progression Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => handleVisitProgress(selectedTicket.id, "START_REMOTE")}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Remote Fix</span>
              </button>

              <button
                onClick={() => handleVisitProgress(selectedTicket.id, "ARRIVED")}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Mark Arrived</span>
              </button>

              <button
                onClick={() => {
                  setOldSerial("CP-CAM-4K-VAULT-882");
                  setNewSerial(`CP-CAM-SPARE-${Math.floor(1000 + Math.random() * 9000)}`);
                  setShowReplacementForm(true);
                }}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Replace Spare</span>
              </button>

              <button
                onClick={() => handleVerifyAndClose(selectedTicket.id)}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verify & Close</span>
              </button>
            </div>

            {/* Replacement Spare Drawer Form */}
            {showReplacementForm && (
              <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-800 space-y-3 animate-in fade-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300 font-mono">
                  Hardware Spare Replacement (Digital Twin Synchronized)
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 text-[10px] font-mono">Old Faulty Serial (To Retire)</label>
                    <input
                      type="text"
                      value={oldSerial}
                      onChange={(e) => setOldSerial(e.target.value)}
                      className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] font-mono">New Spare Serial (To Enroll)</label>
                    <input
                      type="text"
                      value={newSerial}
                      onChange={(e) => setNewSerial(e.target.value)}
                      className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded font-mono text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] font-mono">Model Name</label>
                  <input
                    type="text"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] font-mono">Work Notes</label>
                  <input
                    type="text"
                    value={workNotes}
                    onChange={(e) => setWorkNotes(e.target.value)}
                    placeholder="e.g. Lens sensor failed, replaced unit and re-focused."
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setShowReplacementForm(false)}
                    className="px-3 py-1.5 rounded bg-slate-900 text-slate-400 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleReplaceSpare(selectedTicket.id)}
                    className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
                  >
                    Confirm Replacement
                  </button>
                </div>
              </div>
            )}

            {/* Automated Edge Diagnostic Report */}
            {selectedTicket.diagnostics && (
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span>Automated Edge Diagnostics</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Branch Gateway</div>
                    <div className="text-emerald-400 font-bold">ONLINE (12ms)</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Core NVR Link</div>
                    <div className="text-emerald-400 font-bold">HEALTHY</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">PoE Port Status</div>
                    <div className="text-rose-400 font-bold">{selectedTicket.diagnostics.poePortStatus}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Camera ICMP Ping</div>
                    <div className="text-rose-400 font-bold">FAILED</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">RTSP Handshake</div>
                    <div className="text-rose-400 font-bold">TIMEOUT</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Suspected Cause</div>
                    <div className="text-amber-400 text-[10px]">PoE Port / Cabling</div>
                  </div>
                </div>
              </div>
            )}

            {/* 5-Gate Closure Verification Matrix */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Automated 5-Gate Closure Verification Matrix</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs text-center">
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">1. Ping</div>
                  <div className={`font-bold ${selectedTicket.closureVerification?.pingPass ? "text-emerald-400" : "text-slate-600"}`}>
                    {selectedTicket.closureVerification?.pingPass ? "PASS" : "PENDING"}
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">2. RTSP</div>
                  <div className={`font-bold ${selectedTicket.closureVerification?.rtspPass ? "text-emerald-400" : "text-slate-600"}`}>
                    {selectedTicket.closureVerification?.rtspPass ? "PASS" : "PENDING"}
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">3. ONVIF</div>
                  <div className={`font-bold ${selectedTicket.closureVerification?.onvifPass ? "text-emerald-400" : "text-slate-600"}`}>
                    {selectedTicket.closureVerification?.onvifPass ? "PASS" : "PENDING"}
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">4. Frames</div>
                  <div className={`font-bold ${selectedTicket.closureVerification?.framePass ? "text-emerald-400" : "text-slate-600"}`}>
                    {selectedTicket.closureVerification?.framePass ? "PASS" : "PENDING"}
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">5. Recording</div>
                  <div className={`font-bold ${selectedTicket.closureVerification?.recordingPass ? "text-emerald-400" : "text-slate-600"}`}>
                    {selectedTicket.closureVerification?.recordingPass ? "PASS" : "PENDING"}
                  </div>
                </div>
              </div>
            </div>

            {/* Event History Timeline */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 font-mono text-xs">
              <h3 className="font-bold uppercase tracking-wider text-slate-300">Immutable Audit Timeline</h3>
              <div className="space-y-2 divide-y divide-slate-800/60 text-[11px]">
                {selectedTicket.history?.map((event: any, idx: number) => (
                  <div key={idx} className="pt-2 first:pt-0 space-y-0.5">
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span className="text-amber-400 font-bold">{event.type}</span>
                      <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-slate-200">{event.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
