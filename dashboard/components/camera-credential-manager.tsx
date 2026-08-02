"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, X } from "lucide-react";

interface CameraCredentialManagerProps {
  branchId: string;
  edgeAgentId?: string;
  onCredentialsUpdated?: () => void;
}

type Result = { kind: "success" | "error"; message: string; commandId?: string };

export function CameraCredentialManager({
  branchId,
  edgeAgentId,
  onCredentialsUpdated,
}: CameraCredentialManagerProps) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [scope, setScope] = useState<"default" | "camera">("default");
  const [cameraIp, setCameraIp] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!edgeAgentId) {
      setResult({ kind: "error", message: "This branch does not have an enrolled gateway." });
      return;
    }
    setSaving(true);
    setResult(undefined);
    try {
      const response = await fetch(
        `/api/control/v1/branches/${encodeURIComponent(branchId)}/edge-agents/${encodeURIComponent(edgeAgentId)}/camera-credentials`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            username: username.trim(),
            password,
            ...(scope === "camera" ? { cameraIp: cameraIp.trim() } : {}),
          }),
        },
      );
      const body = await response.json() as { message?: string; error?: string; commandId?: string };
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Unable to queue the credential update");
      setPassword("");
      setResult({
        kind: "success",
        commandId: body.commandId,
        message: "Encrypted update queued. The gateway will apply it locally and rediscover cameras.",
      });
      onCredentialsUpdated?.();
    } catch (error) {
      setResult({ kind: "error", message: error instanceof Error ? error.message : "Credential update failed" });
    } finally {
      setSaving(false);
    }
  }

  function close() {
    if (saving) return;
    setOpen(false);
    setPassword("");
    setResult(undefined);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!edgeAgentId}
      >
        <KeyRound size={17} />
        Camera / DVR credentials
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="camera-credential-title">
          <form onSubmit={submit} className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
              <div className="flex gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"><LockKeyhole size={20} /></span>
                <div>
                  <h2 id="camera-credential-title" className="text-lg font-bold text-slate-950">Secure camera or DVR credentials</h2>
                  <p className="mt-1 text-sm text-slate-500">Enter a DVR login once to discover and monitor all of its analog channels.</p>
                </div>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900"><X size={18} /></button>
            </header>

            <div className="space-y-5 px-6 py-6">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-5 text-blue-900">
                The password is encrypted for this gateway before it enters the command queue. Sentinel Grid never stores a readable copy in the cloud.
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-slate-800">Apply to</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-xl border p-3 ${scope === "default" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                    <input className="mr-2" type="radio" checked={scope === "default"} onChange={() => setScope("default")} />
                    <span className="text-sm font-semibold text-slate-900">Branch default</span>
                    <span className="mt-1 block pl-5 text-xs text-slate-500">Used for cameras and recorders without a specific login.</span>
                  </label>
                  <label className={`cursor-pointer rounded-xl border p-3 ${scope === "camera" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                    <input className="mr-2" type="radio" checked={scope === "camera"} onChange={() => setScope("camera")} />
                    <span className="text-sm font-semibold text-slate-900">One camera / recorder</span>
                    <span className="mt-1 block pl-5 text-xs text-slate-500">Overrides the default for one private IP.</span>
                  </label>
                </div>
              </fieldset>

              {scope === "camera" && (
                <label className="block text-sm font-semibold text-slate-800">
                  Private IP address
                  <input required inputMode="decimal" value={cameraIp} onChange={(event) => setCameraIp(event.target.value)} placeholder="192.168.1.20" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </label>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-800">
                  Username
                  <input required maxLength={128} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </label>
                <label className="block text-sm font-semibold text-slate-800">
                  Password
                  <span className="relative mt-2 block">
                    <input required maxLength={1024} type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </span>
                </label>
              </div>

              {result && (
                <div className={`flex gap-2 rounded-xl border p-3 text-sm ${result.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
                  {result.kind === "success" && <CheckCircle2 className="mt-0.5 shrink-0" size={17} />}
                  <span>{result.message}{result.commandId ? ` Command ${result.commandId.slice(0, 8)} is being tracked in gateway history.` : ""}</span>
                </div>
              )}
            </div>

            <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">Close</button>
              <button type="submit" disabled={saving || !username.trim() || !password || (scope === "camera" && !cameraIp.trim())} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={17} /> : <LockKeyhole size={17} />}
                {saving ? "Encrypting…" : "Encrypt & queue"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
