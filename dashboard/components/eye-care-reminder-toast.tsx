"use client";

import { Eye, Clock, X } from "lucide-react";
import { formatMonitoringDuration } from "@/lib/eye-care";

interface EyeCareReminderToastProps {
  continuousMinutes: number;
  onTakeBreak: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}

export function EyeCareReminderToast({
  continuousMinutes,
  onTakeBreak,
  onSnooze,
  onDismiss,
}: EyeCareReminderToastProps) {
  return (
    <div
      role="alert"
      className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-slate-900/95 border-2 border-emerald-500/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-slate-100 animate-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
            <Eye size={20} className="animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>Eye-Care Micro-Break</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/40">
                20-20-20 Rule
              </span>
            </h4>
            <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
              <Clock size={12} />
              <span>
                Monitored continuously for <strong>{formatMonitoringDuration(continuousMinutes)}</strong>
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <X size={15} />
        </button>
      </div>

      <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
        Rest your eyes for 20 seconds to prevent asthenopia (screen fatigue) and maintain peak vigilance.
      </p>

      <div className="mt-3.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onTakeBreak}
          className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
        >
          Take 20s Rest Now
        </button>
        <button
          type="button"
          onClick={onSnooze}
          className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors border border-slate-700 cursor-pointer"
        >
          Snooze 10m
        </button>
      </div>
    </div>
  );
}
