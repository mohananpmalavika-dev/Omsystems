"use client";

import React, { useState } from "react";
import {
  Volume2,
  Speaker,
  CheckCircle2,
  AlertTriangle,
  Play,
  X,
} from "lucide-react";
import { alertAudioService } from "../../services/alert-audio/alert-audio.service";

export interface AlertAudioActivationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AlertAudioActivationModal({
  isOpen,
  onClose,
}: AlertAudioActivationModalProps) {
  const [activated, setActivated] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEnable = async () => {
    try {
      await alertAudioService.enable();
      setActivated(true);
    } catch {
      // Error reflected in status
    }
  };

  const handleTest = async (sev: "P1" | "P2") => {
    setTesting(sev);
    try {
      await alertAudioService.testSeverity(sev);
    } finally {
      setTimeout(() => setTesting(null), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Volume2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">Surveillance Alert Audio Activation</h3>
            <p className="text-xs text-slate-400">Control Room Operator Session</p>
          </div>
        </div>

        {/* Informational Body */}
        <p className="text-xs text-slate-300 leading-relaxed">
          Browser security policies require operator activation before real-time audible alarms (P1 sirens & P2 chimes) can play for this workstation session.
        </p>

        {/* Status Card */}
        <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Audio Status:</span>
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                activated ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {activated ? "● READY" : "WAITING FOR BROWSER AUDIO"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Output Route:</span>
            <span className="text-slate-200 font-mono">Control Room Speaker 1</span>
          </div>
        </div>

        {/* Buttons */}
        {!activated ? (
          <button
            onClick={handleEnable}
            className="w-full py-2.5 rounded-xl font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-lg transition-all text-center text-xs uppercase tracking-wider"
          >
            Arm Mandatory System Tone
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTest("P1")}
                disabled={testing !== null}
                className="flex-1 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-700 text-rose-200 font-mono text-xs font-bold transition-colors text-center"
              >
                {testing === "P1" ? "Playing..." : "Test P1"}
              </button>
              <button
                onClick={() => handleTest("P2")}
                disabled={testing !== null}
                className="flex-1 py-2 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-700 text-amber-200 font-mono text-xs font-bold transition-colors text-center"
              >
                {testing === "P2" ? "Playing..." : "Test P2"}
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
            >
              Done (Audio Armed)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
