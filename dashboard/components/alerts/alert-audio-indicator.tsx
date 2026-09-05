"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Volume2,
  VolumeX,
  AlertTriangle,
  Speaker,
  CheckCircle2,
  Smartphone,
  Laptop,
} from "lucide-react";
import { alertAudioService } from "../../services/alert-audio/alert-audio.service";
import type { AlertAudioStatus, AlertSeverity } from "../../services/alert-audio/alert-audio.types";

export function AlertAudioIndicator() {
  const [status, setStatus] = useState<AlertAudioStatus>(alertAudioService.getAudioStatus());
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize user's account preference across all devices on mount
    void alertAudioService.init();
    return alertAudioService.onStatusChange(setStatus);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleTest = async (sev: AlertSeverity) => {
    setTesting(sev);
    try {
      await alertAudioService.testSeverity(sev);
    } finally {
      setTimeout(() => setTesting(null), 500);
    }
  };

  const isEnabled = status.enabled;
  const isReady = status.state === "READY" && isEnabled && !status.muted;
  const isMuted = status.muted && isEnabled;
  const isFailed = status.state === "FAILED";

  return (
    <div className="relative font-sans" ref={dropdownRef}>
      {/* Permanent Header Pill Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
          isReady
            ? "bg-emerald-950/70 border-emerald-600 text-emerald-300 hover:bg-emerald-900/80 shadow-sm shadow-emerald-950/50"
            : isMuted
            ? "bg-amber-950/70 border-amber-600 text-amber-300 hover:bg-amber-900/80"
            : isFailed
            ? "bg-rose-950/70 border-rose-600 text-rose-300 hover:bg-rose-900/80 animate-pulse"
            : "bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
        }`}
        title="Control Room Alert Audio Status & Cross-Device Controls"
      >
        {isReady ? (
          <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : isMuted ? (
          <VolumeX className="h-3.5 w-3.5 text-amber-400" />
        ) : isFailed ? (
          <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
        ) : (
          <VolumeX className="h-3.5 w-3.5 text-slate-400" />
        )}
        <span>AUDIO: {isEnabled ? (isMuted ? "MUTED" : "ON") : "OFF"}</span>
        {status.activeP1Count > 0 && (
          <span className="px-1 py-0.2 rounded bg-rose-600 text-white text-[10px] font-black">
            P1 × {status.activeP1Count}
          </span>
        )}
      </button>

      {/* Popover Settings Drawer */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-84 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-4 z-50 space-y-4 text-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Speaker className="h-4 w-4 text-sky-400" />
              <span>Surveillance Audio Alerts</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                isReady
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : isMuted
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              {isEnabled ? (isMuted ? "MUTED" : "ACTIVE (ON)") : "DISABLED (OFF)"}
            </span>
          </div>

          {/* Primary Cross-Device Toggle Button */}
          <div className="space-y-1.5">
            {isEnabled ? (
              <button
                type="button"
                onClick={() => alertAudioService.disable()}
                className="w-full py-2 px-3 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-600 text-rose-200 font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <VolumeX className="h-4 w-4 text-rose-400" />
                <span>Turn Off Audio Alert (All Devices)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => alertAudioService.enable()}
                className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-950/40"
              >
                <Volume2 className="h-4 w-4" />
                <span>Turn On Audio Alert (All Devices)</span>
              </button>
            )}
            <div className="flex items-center gap-1 text-[10px] text-slate-400 px-1">
              <Laptop className="h-3 w-3 text-slate-500" />
              <Smartphone className="h-3 w-3 text-slate-500" />
              <span>
                {isEnabled
                  ? "Synced to your account: stays ON until you turn it off."
                  : "Synced to your account: stays OFF until you turn it on."}
              </span>
            </div>
          </div>

          {/* Volume Control */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Master Alert Volume</span>
              <span className="font-mono text-slate-200">{(status.volume * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={status.volume}
              onChange={(e) => alertAudioService.setVolume(Number(e.target.value))}
              disabled={!isEnabled}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500 disabled:opacity-40"
            />
          </div>

          {/* Status & Routing Details */}
          <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1 text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>Account Sync:</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>Active</span>
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Audio Context:</span>
              <span className="text-slate-300 font-mono">
                {status.audioContextState ?? (isEnabled ? "armed" : "closed")}
              </span>
            </div>
          </div>

          {/* Severity Tone Self-Tests */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Audio Self-Test Tones
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTest("P1")}
                disabled={testing !== null || !isEnabled}
                className="px-2 py-1.5 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-700 text-rose-200 font-mono font-bold transition-colors text-center disabled:opacity-40"
              >
                {testing === "P1" ? "Playing..." : "Test P1"}
              </button>
              <button
                type="button"
                onClick={() => handleTest("P2")}
                disabled={testing !== null || !isEnabled}
                className="px-2 py-1.5 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-700 text-amber-200 font-mono font-bold transition-colors text-center disabled:opacity-40"
              >
                {testing === "P2" ? "Playing..." : "Test P2"}
              </button>
              <button
                type="button"
                onClick={() => handleTest("P3")}
                disabled={testing !== null || !isEnabled}
                className="px-2 py-1.5 rounded bg-sky-950/60 hover:bg-sky-900 border border-sky-700 text-sky-200 font-mono font-bold transition-colors text-center disabled:opacity-40"
              >
                {testing === "P3" ? "Playing..." : "Test P3"}
              </button>
            </div>
          </div>

          {/* Secondary Controls (when enabled) */}
          {isEnabled && (
            <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => alertAudioService.silenceTemporarily(30)}
                className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-colors cursor-pointer"
              >
                Silence 30s
              </button>
              <button
                type="button"
                onClick={() => alertAudioService.stopAll()}
                className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-colors cursor-pointer"
              >
                Stop Siren
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
