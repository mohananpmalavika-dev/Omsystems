"use client";

import React, { useState } from "react";
import { deviceManagementApi } from "@/lib/api-client";
import { Key, ShieldAlert, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface Device {
  id: string;
  deviceId: string;
  manufacturer: string;
  model: string;
  healthStatus: string;
  capabilities?: string[];
}

interface CredentialRotationFormProps {
  device: Device;
  onSuccess?: (jobId: string) => void;
}

export function CredentialRotationForm({ device, onSuccess }: CredentialRotationFormProps) {
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'scheduled' | 'emergency'>('scheduled');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; jobId?: string; message?: string; error?: string } | null>(null);

  const supportsRotation = device.capabilities?.includes('credential-rotation') ?? true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (reason.length < 5) {
      setResult({
        success: false,
        error: 'Please provide a rotation rationale (minimum 5 characters)',
      });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const response = await deviceManagementApi.startPasswordRotation({
        deviceId: device.id,
        reason,
        rotationMode: mode,
      });

      setResult({
        success: true,
        jobId: response.jobId,
        message: response.message || "Credential rotation initiated via Device Vault & Edge Agent",
      });

      setReason('');

      if (onSuccess && response.jobId) {
        onSuccess(response.jobId);
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || 'Failed to initiate credential rotation',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!supportsRotation) {
    return (
      <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200 text-xs font-mono">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <h3 className="font-bold">Credential rotation not supported</h3>
            <p className="text-[11px] text-amber-300/80 mt-0.5">
              This legacy device model does not support automated API credential rotation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="credential-rotation-form space-y-4 font-mono text-xs">
      {/* Notice */}
      <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-start space-x-2.5">
        <Key className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-[11px] text-slate-300">
          <strong className="text-indigo-300">Hardware Vault Security:</strong> A 32-character AES-256-GCM encrypted password will be automatically generated, dispatched to the branch edge agent via mTLS, and applied directly to the camera/DVR firmware.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Reason */}
        <div>
          <label htmlFor="reason" className="block text-slate-300 font-semibold mb-1.5">
            Audit Reason for Credential Rotation <span className="text-rose-400">*</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Scheduled quarterly rotation, technician deboarding, security compliance review"
            rows={3}
            required
            minLength={5}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
          />
        </div>

        {/* Mode */}
        <div className="space-y-2">
          <label className="block text-slate-300 font-semibold">
            Execution Priority
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${
              mode === 'scheduled' ? 'bg-indigo-950/40 border-indigo-500' : 'bg-slate-950 border-slate-800'
            }`}>
              <input
                type="radio"
                value="scheduled"
                checked={mode === 'scheduled'}
                onChange={(e) => setMode(e.target.value as 'scheduled')}
                className="mt-0.5 mr-2.5"
              />
              <div>
                <div className="font-bold text-slate-200">Scheduled Rotation</div>
                <div className="text-[10px] text-slate-400">Normal priority. Executed in nightly maintenance window.</div>
              </div>
            </label>

            <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${
              mode === 'emergency' ? 'bg-rose-950/40 border-rose-500' : 'bg-slate-950 border-slate-800'
            }`}>
              <input
                type="radio"
                value="emergency"
                checked={mode === 'emergency'}
                onChange={(e) => setMode(e.target.value as 'emergency')}
                className="mt-0.5 mr-2.5"
              />
              <div>
                <div className="font-bold text-rose-300">Emergency Instant Rotation</div>
                <div className="text-[10px] text-slate-400">High priority. Dispatched immediately via edge mTLS channel.</div>
              </div>
            </label>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || reason.length < 5}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow flex items-center justify-center transition-all disabled:opacity-50"
        >
          {submitting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Dispatching Rotation Job...
            </>
          ) : (
            'Initiate Hardware Credential Rotation'
          )}
        </button>
      </form>

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-xl border ${
          result.success
            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
            : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
        }`}>
          {result.success ? (
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-bold text-emerald-300">Rotation Job Enqueued</h4>
                <p className="text-[11px] text-emerald-200/90 mt-0.5">{result.message}</p>
                {result.jobId && <p className="text-[10px] text-emerald-400 mt-1">Job ID: {result.jobId}</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-bold text-rose-300">Operation Failed</h4>
                <p className="text-[11px] text-rose-200/90 mt-0.5">{result.error}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
