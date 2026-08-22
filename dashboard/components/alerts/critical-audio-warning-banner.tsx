"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, VolumeX, Volume2 } from "lucide-react";
import { alertAudioService } from "../../services/alert-audio/alert-audio.service";
import type { AlertAudioStatus } from "../../services/alert-audio/alert-audio.types";

export function CriticalAudioWarningBanner({ activeP1Count = 0 }: { activeP1Count?: number }) {
  const [status, setStatus] = useState<AlertAudioStatus>(alertAudioService.getAudioStatus());

  useEffect(() => {
    return alertAudioService.onStatusChange(setStatus);
  }, []);

  const isAudioUnavailable = status.state === "LOCKED" || status.state === "FAILED" || status.muted;
  const showWarning = activeP1Count > 0 && isAudioUnavailable;

  if (!showWarning) return null;

  return (
    <div className="rounded-xl border-2 border-rose-500 bg-rose-950/90 text-rose-100 p-4 flex items-center justify-between shadow-2xl animate-pulse font-sans">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-rose-600/30 border border-rose-500 text-rose-300">
          <VolumeX className="h-6 w-6" />
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <span>Critical Alert Audio Not Armed</span>
            <span className="px-2 py-0.2 rounded bg-rose-600 text-white text-xs font-black">
              {activeP1Count} Active P1 Alert{activeP1Count > 1 ? "s" : ""}
            </span>
          </h4>
          <p className="text-xs text-rose-200 mt-0.5">
            Real-time audible sirens are disabled or locked by the browser. Operator must activate audio to hear emergency alarms.
          </p>
        </div>
      </div>

      <button
        onClick={() => alertAudioService.enable()}
        className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-rose-500 hover:bg-rose-400 text-white shadow-lg transition-all shrink-0 ml-4"
      >
        Enable Audio Now
      </button>
    </div>
  );
}
