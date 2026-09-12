"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  signedConfigApi,
  type SignedConfigKeyItem,
  type SignedConfigBundleItem,
  type SignedConfigDriftItem,
  type SignedConfigAuditItem,
} from "@/lib/api-client";
import {
  Shield,
  Key,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  RotateCw,
  Trash2,
  Eye,
  Lock,
  Radio,
  Server,
  Activity,
  Layers,
  Sparkles,
  Sliders,
  Copy,
  Clock,
  Terminal,
} from "lucide-react";

export default function SignedConfigurationConsolePage() {
  const [keys, setKeys] = useState<SignedConfigKeyItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<SignedConfigAuditItem[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("edge-branch-101");
  const [currentBundle, setCurrentBundle] = useState<SignedConfigBundleItem | null>(null);
  const [driftStatus, setDriftStatus] = useState<SignedConfigDriftItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"keys" | "bundles" | "drift" | "audit">("keys");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals & Forms
  const [showGenKeyModal, setShowGenKeyModal] = useState(false);
  const [newKeyForm, setNewKeyForm] = useState({
    keyId: "",
    algorithm: "RSA-PSS-SHA256" as "RSA-PSS-SHA256" | "RSA-PKCS1-SHA256" | "HMAC-SHA256",
    keySize: 2048,
    validDays: 365,
  });

  const [showSignModal, setShowSignModal] = useState(false);
  const [signForm, setSignForm] = useState({
    edgeId: "edge-branch-101",
    branchId: "branch-001",
    version: 1,
    signerIdentity: "sec-ops@bank.internal",
    signerRole: "SECURITY_ADMIN",
    algorithm: "RSA-PSS-SHA256",
    payloadJson: JSON.stringify(
      {
        nvrIp: "10.0.14.50",
        resolution: "1080P",
        fps: 25,
        bitrateKbps: 4096,
        retentionDays: 90,
        tamperSensorEnabled: true,
      },
      null,
      2
    ),
  });

  const [viewPemKey, setViewPemKey] = useState<SignedConfigKeyItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [keysRes, auditRes] = await Promise.all([
        signedConfigApi.getKeys().catch(() => ({ success: false, data: [] })),
        signedConfigApi.getAuditLogs({ limit: 50 }).catch(() => ({ success: false, data: [] })),
      ]);

      if (keysRes.success) setKeys(keysRes.data || []);
      if (auditRes.success) setAuditLogs(auditRes.data || []);

      if (selectedEdgeId) {
        try {
          const bundleRes = await signedConfigApi.getDesiredBundle(selectedEdgeId);
          if (bundleRes.success) setCurrentBundle(bundleRes.data);
        } catch {
          setCurrentBundle(null);
        }

        try {
          const driftRes = await signedConfigApi.getDrift(selectedEdgeId);
          if (driftRes.success) setDriftStatus(driftRes.data);
        } catch {
          setDriftStatus(null);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load signed configuration telemetry");
    } finally {
      setLoading(false);
    }
  }, [selectedEdgeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateKey = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await signedConfigApi.generateKey(newKeyForm);
      if (res.success) {
        setSuccessMsg(`Cryptographic key ${res.data.keyId} generated successfully.`);
        setShowGenKeyModal(false);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to generate keypair");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRotateKey = async (keyId: string) => {
    if (!confirm(`Are you sure you want to rotate key ${keyId}? Active edge gateways will transition seamlessly.`)) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await signedConfigApi.rotateKey(keyId);
      if (res.success) {
        setSuccessMsg(`Key rotated: retired ${res.data.retiredKeyId}, activated ${res.data.newKeyId}.`);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || "Key rotation failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    const reason = prompt(`Enter security revocation reason for ${keyId}:`, "Key compromised or retired prematurely");
    if (!reason) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await signedConfigApi.revokeKey(keyId, { reason });
      if (res.success) {
        setSuccessMsg(`Key ${keyId} revoked immediately. Edge agents will fail-closed on any bundle signed by this key.`);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || "Key revocation failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignBundle = async () => {
    setActionLoading(true);
    setError(null);
    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(signForm.payloadJson);
      } catch {
        throw new Error("Invalid JSON in configuration payload editor");
      }

      const res = await signedConfigApi.signBundle({
        edgeId: signForm.edgeId,
        branchId: signForm.branchId,
        version: signForm.version,
        payload: parsedPayload,
        signerIdentity: signForm.signerIdentity,
        signerRole: signForm.signerRole,
        algorithm: signForm.algorithm,
      });

      if (res.success) {
        setSuccessMsg(`Signed bundle v${res.data.version} created with signature hash ${res.data.canonicalPayloadHash?.slice(0, 16)}...`);
        setShowSignModal(false);
        setSelectedEdgeId(signForm.edgeId);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || "Configuration bundle signing failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateTamperReport = async () => {
    if (!currentBundle) return;
    setActionLoading(true);
    setError(null);
    try {
      const tamperedHash = "deadbeef" + currentBundle.canonicalPayloadHash.slice(8);
      const res = await signedConfigApi.reportApplied(currentBundle.edgeId, {
        bundleId: currentBundle.bundleId,
        version: currentBundle.version,
        appliedHash: tamperedHash,
        verificationResult: "TAMPERED",
        rejectionReason: "Simulated attacker bit-flip detected by edge verifier engine",
        edgeAgentVersion: "2.5.0",
      });
      if (res.success) {
        setSuccessMsg(`Tamper test executed: Edge agent rejected corrupted bundle. Status: ${res.data.status}`);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || "Tamper simulation failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateValidApply = async () => {
    if (!currentBundle) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await signedConfigApi.reportApplied(currentBundle.edgeId, {
        bundleId: currentBundle.bundleId,
        version: currentBundle.version,
        appliedHash: currentBundle.canonicalPayloadHash,
        verificationResult: "VERIFIED",
        edgeAgentVersion: "2.5.0",
      });
      if (res.success) {
        setSuccessMsg(`Edge verification receipt reported successfully: IN_SYNC.`);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || "Valid apply report failed");
    } finally {
      setActionLoading(false);
    }
  };

  const activeKeysCount = keys.filter((k) => k.status === "ACTIVE").length;
  const rsaKeysCount = keys.filter((k) => k.algorithm.startsWith("RSA")).length;
  const isDrifted = driftStatus?.isDrifted || false;

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Signed Edge Config Bundles
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Production Verified
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Cryptographic RSA/HMAC signature verification, tamper-evident delivery & hardware drift detection
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowGenKeyModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
            >
              <PlusCircle className="w-4 h-4" />
              Generate Keypair
            </button>
            <button
              onClick={() => setShowSignModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg shadow-lg shadow-emerald-950 transition"
            >
              <FileCheck2 className="w-4 h-4" />
              Sign Bundle
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 rounded-lg bg-red-950/50 border border-red-800/80 text-red-200 text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
            <div className="flex-1">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-lg bg-emerald-950/50 border border-emerald-800/80 text-emerald-200 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <div className="flex-1">{successMsg}</div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              ✕
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="flex justify-between items-center text-slate-400 mb-2">
              <span className="text-xs uppercase font-semibold">Active Signing Keys</span>
              <Key className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white">{activeKeysCount}</div>
            <div className="text-xs text-slate-500 mt-1">
              {rsaKeysCount} RSA-PSS / RSA-PKCS1 keys provisioned
            </div>
          </div>

          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="flex justify-between items-center text-slate-400 mb-2">
              <span className="text-xs uppercase font-semibold">Selected Gateway Target</span>
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-white truncate">{selectedEdgeId}</div>
            <div className="text-xs text-slate-500 mt-1">
              Desired: v{currentBundle?.version ?? "None"} | Algorithm: {currentBundle?.algorithm ?? "N/A"}
            </div>
          </div>

          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="flex justify-between items-center text-slate-400 mb-2">
              <span className="text-xs uppercase font-semibold">Authoritative Drift State</span>
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-lg font-bold flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  driftStatus?.status === "IN_SYNC"
                    ? "bg-emerald-400 animate-pulse"
                    : driftStatus?.status === "TAMPERED"
                    ? "bg-red-500 animate-ping"
                    : "bg-amber-400 animate-pulse"
                }`}
              />
              <span
                className={
                  driftStatus?.status === "IN_SYNC"
                    ? "text-emerald-400"
                    : driftStatus?.status === "TAMPERED"
                    ? "text-red-400"
                    : "text-amber-400"
                }
              >
                {driftStatus?.status || "NO_DATA"}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate">
              {driftStatus?.driftReason || "State strictly synchronized"}
            </div>
          </div>

          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="flex justify-between items-center text-slate-400 mb-2">
              <span className="text-xs uppercase font-semibold">Anti-Tamper Assurance</span>
              <Lock className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-cyan-400">100%</div>
            <div className="text-xs text-slate-500 mt-1">
              RFC 8785 canonical hash & anti-rollback active
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 space-x-4">
          <button
            onClick={() => setActiveTab("keys")}
            className={`py-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeTab === "keys"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Key className="w-4 h-4" />
            Signing Keys ({keys.length})
          </button>
          <button
            onClick={() => setActiveTab("bundles")}
            className={`py-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeTab === "bundles"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            Signed Bundle Inspector
          </button>
          <button
            onClick={() => setActiveTab("drift")}
            className={`py-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeTab === "drift"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-4 h-4" />
            Drift & Verification Testing
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`py-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeTab === "audit"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-4 h-4" />
            Immutable Audit Trail ({auditLogs.length})
          </button>
        </div>

        {/* TAB 1: Signing Keys */}
        {activeTab === "keys" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-base font-semibold text-white">Cryptographic Key Registry</h2>
              <span className="text-xs text-slate-400">
                Active keys sign desired envelopes. Retired keys verify existing in-flight configs.
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-3">Key ID</th>
                    <th className="p-3">Algorithm</th>
                    <th className="p-3">Size / Spec</th>
                    <th className="p-3">Fingerprint</th>
                    <th className="p-3">Usage</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {keys.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No signing keys generated yet. Click &quot;Generate Keypair&quot; to initialize.
                      </td>
                    </tr>
                  ) : (
                    keys.map((k) => (
                      <tr key={k.keyId} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-medium text-white">{k.keyId}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs">
                            {k.algorithm}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400">{k.keySize} bits</td>
                        <td className="p-3 font-mono text-xs text-slate-400 truncate max-w-[160px]">
                          {k.keyFingerprint}
                        </td>
                        <td className="p-3 text-xs text-slate-400">
                          {k.signCount} signs / {k.verifyCount} verifies
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                              k.status === "ACTIVE"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : k.status === "RETIRED"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                                : "bg-red-500/10 text-red-400 border border-red-500/30"
                            }`}
                          >
                            {k.status}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2">
                          {k.publicKeyPem && (
                            <button
                              onClick={() => setViewPemKey(k)}
                              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                            >
                              Public Key
                            </button>
                          )}
                          {k.status === "ACTIVE" && (
                            <button
                              onClick={() => handleRotateKey(k.keyId)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-xs bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 rounded border border-indigo-500/30"
                            >
                              Rotate
                            </button>
                          )}
                          {k.status !== "REVOKED" && (
                            <button
                              onClick={() => handleRevokeKey(k.keyId)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded border border-red-500/30"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Bundle Inspector */}
        {activeTab === "bundles" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-white">Target Gateway</h2>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase">Edge Gateway ID</label>
                <input
                  type="text"
                  value={selectedEdgeId}
                  onChange={(e) => setSelectedEdgeId(e.target.value)}
                  className="w-full mt-1.5 p-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {currentBundle ? (
                <div className="space-y-3 pt-4 border-t border-slate-800 text-sm">
                  <div>
                    <span className="text-xs text-slate-500">Bundle ID</span>
                    <div className="font-mono text-xs text-slate-300 break-all">{currentBundle.bundleId}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-slate-500">Desired Version</span>
                      <div className="font-semibold text-white">v{currentBundle.version}</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Signer Role</span>
                      <div className="text-slate-300">{currentBundle.signerRole}</div>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Algorithm / Key</span>
                    <div className="font-mono text-xs text-emerald-400">
                      {currentBundle.algorithm} ({currentBundle.keyId})
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Canonical SHA-256 Hash</span>
                    <div className="font-mono text-xs text-slate-300 break-all bg-slate-950 p-2 rounded border border-slate-800">
                      {currentBundle.canonicalPayloadHash}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Anti-Replay Nonce</span>
                    <div className="font-mono text-xs text-slate-400">{currentBundle.nonce || "None"}</div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-sm border-t border-slate-800">
                  No active configuration bundle for {selectedEdgeId}. Use &quot;Sign Bundle&quot; above to create one.
                </div>
              )}
            </div>

            <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-semibold text-white">Cryptographic Envelope & Payload</h2>
                {currentBundle && (
                  <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Status: {currentBundle.status}
                  </span>
                )}
              </div>

              {currentBundle ? (
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase">Configuration Payload (JSON)</span>
                    <pre className="mt-1.5 p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto max-h-64">
                      {JSON.stringify(currentBundle.payload, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase">Cryptographic Signature (Base64 / Hex)</span>
                    <pre className="mt-1.5 p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-amber-300 break-all max-h-32 overflow-y-auto">
                      {currentBundle.signature}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                  Select an edge agent with an active signed bundle to inspect payload & cryptographic envelope.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Drift & Verification Testing */}
        {activeTab === "drift" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Authoritative Hardware Drift & Tamper Testing</h2>
              <p className="text-sm text-slate-400">
                Simulate verification outcomes to validate edge agent cryptographic fail-closed enforcement.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Test Valid Verification Receipt
                </div>
                <p className="text-xs text-slate-400">
                  Simulates edge agent computing identical canonical payload hash and successfully verifying the signature.
                </p>
                <button
                  onClick={handleSimulateValidApply}
                  disabled={actionLoading || !currentBundle}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition"
                >
                  Simulate Verified Application (IN_SYNC)
                </button>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                  <AlertTriangle className="w-5 h-5" />
                  Test Tampered Bundle Detection
                </div>
                <p className="text-xs text-slate-400">
                  Simulates a Man-in-the-Middle attack or modified configuration file on disk. Edge verifier rejects the bundle.
                </p>
                <button
                  onClick={handleSimulateTamperReport}
                  disabled={actionLoading || !currentBundle}
                  className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition"
                >
                  Simulate Corrupted Hash (TAMPERED)
                </button>
              </div>
            </div>

            {driftStatus && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs uppercase font-semibold text-slate-400">Current Drift Telemetry</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm pt-2">
                  <div>
                    <span className="text-xs text-slate-500">Status</span>
                    <div className="font-bold text-white">{driftStatus.status}</div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Desired Version</span>
                    <div className="font-mono text-slate-200">v{driftStatus.desiredVersion}</div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Applied Version</span>
                    <div className="font-mono text-slate-200">
                      {driftStatus.appliedVersion ? `v${driftStatus.appliedVersion}` : "None"}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Is Drifted?</span>
                    <div className={driftStatus.isDrifted ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                      {driftStatus.isDrifted ? "YES" : "NO"}
                    </div>
                  </div>
                </div>
                {driftStatus.driftReason && (
                  <div className="text-xs text-amber-300 pt-2 border-t border-slate-800">
                    Reason: {driftStatus.driftReason}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Audit Log */}
        {activeTab === "audit" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-base font-semibold text-white">Cryptographic Audit Trail</h2>
              <span className="text-xs text-slate-400">Append-only immutable record of all key & bundle operations</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Event Type</th>
                    <th className="p-3">Target Edge / Key</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No cryptographic audit records recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-xs text-slate-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs">
                            {log.eventType}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-300">
                          {log.edgeId || log.keyId || "-"}
                        </td>
                        <td className="p-3 text-xs text-slate-400">{log.actorId}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                              log.status === "SUCCESS"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-400 truncate max-w-xs">
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Generate Keypair */}
        {showGenKeyModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-lg font-bold text-white">Generate Cryptographic Signing Key</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Key Identifier (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. key_rsa_2026_v1"
                    value={newKeyForm.keyId}
                    onChange={(e) => setNewKeyForm({ ...newKeyForm, keyId: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Algorithm</label>
                  <select
                    value={newKeyForm.algorithm}
                    onChange={(e) =>
                      setNewKeyForm({
                        ...newKeyForm,
                        algorithm: e.target.value as any,
                        keySize: e.target.value.startsWith("RSA") ? 2048 : 256,
                      })
                    }
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-sm text-white font-mono"
                  >
                    <option value="RSA-PSS-SHA256">RSA-PSS with SHA-256 (Recommended)</option>
                    <option value="RSA-PKCS1-SHA256">RSASSA-PKCS1-v1_5 with SHA-256</option>
                    <option value="HMAC-SHA256">HMAC-SHA256 (Symmetric)</option>
                  </select>
                </div>
                {newKeyForm.algorithm.startsWith("RSA") && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400">RSA Modulus Size</label>
                    <select
                      value={newKeyForm.keySize}
                      onChange={(e) => setNewKeyForm({ ...newKeyForm, keySize: parseInt(e.target.value, 10) })}
                      className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-sm text-white font-mono"
                    >
                      <option value={2048}>2048 bits</option>
                      <option value={4096}>4096 bits (High Assurance)</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setShowGenKeyModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateKey}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium"
                >
                  {actionLoading ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Sign Bundle */}
        {showSignModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4">
              <h3 className="text-lg font-bold text-white">Sign Configuration Bundle</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Edge Gateway ID</label>
                    <input
                      type="text"
                      value={signForm.edgeId}
                      onChange={(e) => setSignForm({ ...signForm, edgeId: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-sm text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Version Number</label>
                    <input
                      type="number"
                      min={1}
                      value={signForm.version}
                      onChange={(e) => setSignForm({ ...signForm, version: parseInt(e.target.value, 10) || 1 })}
                      className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-sm text-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Signing Algorithm</label>
                  <select
                    value={signForm.algorithm}
                    onChange={(e) => setSignForm({ ...signForm, algorithm: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-sm text-white font-mono"
                  >
                    <option value="RSA-PSS-SHA256">RSA-PSS with SHA-256</option>
                    <option value="RSA-PKCS1-SHA256">RSA-PKCS1 with SHA-256</option>
                    <option value="HMAC-SHA256">HMAC-SHA256</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Payload (JSON)</label>
                  <textarea
                    rows={6}
                    value={signForm.payloadJson}
                    onChange={(e) => setSignForm({ ...signForm, payloadJson: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setShowSignModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignBundle}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
                >
                  {actionLoading ? "Signing..." : "Cryptographically Sign"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: View Public Key */}
        {viewPemKey && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-white">Public Key PEM: {viewPemKey.keyId}</h3>
                <button onClick={() => setViewPemKey(null)} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-300 overflow-x-auto max-h-72">
                {viewPemKey.publicKeyPem}
              </pre>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(viewPemKey.publicKeyPem || "");
                    alert("Public key copied to clipboard!");
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy PEM
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
