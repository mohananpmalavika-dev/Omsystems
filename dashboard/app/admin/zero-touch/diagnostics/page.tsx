"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Server,
  Terminal,
  FileCode,
  Layers,
  Network,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Radio,
  Cpu,
} from "lucide-react";

export default function ZeroTouchDiagnosticsPage() {
  const [selectedBranch, setSelectedBranch] = useState("");
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [branches, setBranches] = useState<Array<{ branchId: string; branchName: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchDiagnostics = async (branchId: string) => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/zero-touch/diagnostics/${branchId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || data.message || `Diagnostics request failed (${res.status})`);
      setDiagnostics(data.data);
    } catch (reason) {
      setDiagnostics(null);
      setError(reason instanceof Error ? reason.message : "Diagnostics are unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/zero-touch/fleet", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || `Fleet request failed (${response.status})`);
        return Array.isArray(body.data?.branches) ? body.data.branches : [];
      })
      .then((nextBranches) => {
        if (cancelled) return;
        const normalized = nextBranches
          .filter((branch: any) => typeof branch?.branchId === "string")
          .map((branch: any) => ({ branchId: branch.branchId, branchName: branch.branchName || branch.branchId }));
        setBranches(normalized);
        setSelectedBranch((current) => normalized.some((branch) => branch.branchId === current) ? current : normalized[0]?.branchId || "");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Fleet inventory is unavailable");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void fetchDiagnostics(selectedBranch);
  }, [selectedBranch]);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Link
              href="/admin/zero-touch"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-indigo-400" />
                Zero-Touch Provisioning Diagnostics &amp; Engineering Raw Probes
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Low-level ONVIF SOAP envelopes, mTLS certificate thumbprints, vendor CGI payloads, and RTSP SDP handshakes
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select a branch</option>
              {branches.map((branch) => <option key={branch.branchId} value={branch.branchId}>{branch.branchName} ({branch.branchId})</option>)}
            </select>

            <button
              onClick={() => fetchDiagnostics(selectedBranch)}
              disabled={loading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center shadow"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Re-probe Branch
            </button>
          </div>
        </div>

        {error && !diagnostics && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div>}

        {diagnostics && (
          <div className="space-y-6">
            {/* Top diagnostic status grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* mTLS Status */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800 pb-2">
                  <span className="flex items-center text-indigo-300">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                    mTLS Security Channel
                  </span>
                  <span className="text-emerald-400 font-bold">VERIFIED</span>
                </div>
                <div className="space-y-1 text-slate-300 text-[11px]">
                  <div>SAN: <strong className="text-slate-100">{diagnostics.mTLSStatus.san}</strong></div>
                  <div>Serial: <span className="text-slate-400">{diagnostics.mTLSStatus.clientCertSerial}</span></div>
                  <div className="truncate text-slate-400">Thumbprint: {diagnostics.mTLSStatus.thumbprint}</div>
                </div>
              </div>

              {/* Subnet Diagnostics */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800 pb-2">
                  <span className="flex items-center text-cyan-300">
                    <Network className="w-3.5 h-3.5 mr-1.5" />
                    LAN Interfaces
                  </span>
                  <span className="text-emerald-400 font-bold">HEALTHY</span>
                </div>
                <div className="space-y-1 text-slate-300 text-[11px]">
                  <div>Gateway: <strong className="text-slate-100">{diagnostics.networkDiagnostics.gatewayIp}</strong></div>
                  <div>ARP Entries: <span className="text-slate-100">{diagnostics.networkDiagnostics.arpTableEntries} active</span></div>
                  <div>DNS Latency: <span className="text-cyan-300 font-bold">{diagnostics.networkDiagnostics.dnsLatencyMs}ms</span></div>
                </div>
              </div>

              {/* Multicast UDP 3702 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800 pb-2">
                  <span className="flex items-center text-emerald-300">
                    <Radio className="w-3.5 h-3.5 mr-1.5" />
                    UDP 3702 ONVIF Broadcast
                  </span>
                  <span className="text-emerald-400 font-bold">REACHABLE</span>
                </div>
                <div className="space-y-1 text-slate-300 text-[11px]">
                  <div>Multicast: <strong className="text-slate-100">239.255.255.250</strong></div>
                  <div>Packet Loss: <span className="text-emerald-400 font-bold">{diagnostics.networkDiagnostics.packetLossPct}%</span></div>
                  <div>Agent ID: <span className="text-slate-400">{diagnostics.agentId}</span></div>
                </div>
              </div>
            </div>

            {/* Raw SOAP / CGI / SDP Probes */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-slate-100 text-sm flex items-center">
                  <FileCode className="w-4 h-4 mr-2 text-indigo-400" />
                  Raw Discovery Probes &amp; Payload Inspector
                </h3>
                <span className="text-xs text-slate-400 font-mono">({diagnostics.rawProbes.length} raw payloads recorded)</span>
              </div>

              <div className="space-y-4">
                {diagnostics.rawProbes.map((probe: any, idx: number) => (
                  <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 border border-indigo-500/40 text-indigo-300">
                          {probe.protocol}
                        </span>
                        <strong className="text-slate-200">{probe.targetIp}</strong>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px]">
                        <span className="text-cyan-300 font-bold">⏱ {probe.latencyMs}ms</span>
                        <span className="text-emerald-400 font-bold">{probe.status}</span>
                        <button
                          onClick={() => handleCopy(probe.responsePayload, idx)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center"
                        >
                          {copiedIndex === idx ? <Check className="w-3 h-3 mr-1 text-emerald-400" /> : <Copy className="w-3 h-3 mr-1" />}
                          {copiedIndex === idx ? "Copied" : "Copy Payload"}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Request Packet:</div>
                        <div className="bg-slate-900 p-2.5 rounded-lg text-slate-300 overflow-x-auto text-[11px] max-h-36 whitespace-pre-wrap">
                          {probe.requestPayload}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Agent Response Payload:</div>
                        <div className="bg-slate-900 p-2.5 rounded-lg text-emerald-400 overflow-x-auto text-[11px] max-h-36 whitespace-pre-wrap">
                          {probe.responsePayload}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Agent Live Log Stream */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="font-bold text-slate-100 text-sm flex items-center">
                  <Terminal className="w-4 h-4 mr-2 text-emerald-400" />
                  Edge Agent Telemetry Logs ({diagnostics.agentId})
                </h3>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl text-slate-300 space-y-1 text-[11px] max-h-48 overflow-y-auto">
                {diagnostics.agentLogs.map((log: string, lIdx: number) => (
                  <div key={lIdx} className="text-emerald-300/90">{log}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
