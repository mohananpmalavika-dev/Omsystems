"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  MessageSquarePlus,
  Pin,
  PinOff,
  X,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Clock,
  User,
  Send,
  ChevronDown,
  ChevronUp,
  Radio,
} from "lucide-react";
import { useLiveAnnotations } from "@/hooks/useLiveAnnotations";
import type { CameraAnnotation } from "@/hooks/useLiveAnnotations";

interface CameraAnnotationPanelProps {
  cameraId: string;
  cameraName: string;
  operatorName?: string;
  isOpen: boolean;
  onClose: () => void;
}

const PRIORITY_CONFIGS = {
  critical: {
    label: "Critical",
    icon: "🚨",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/60",
    dotClass: "bg-red-400",
  },
  high: {
    label: "High Priority",
    icon: "⚠️",
    badgeClass: "bg-orange-500/20 text-orange-300 border-orange-500/60",
    dotClass: "bg-orange-400",
  },
  medium: {
    label: "Medium",
    icon: "📌",
    badgeClass: "bg-yellow-500/20 text-yellow-300 border-yellow-500/60",
    dotClass: "bg-yellow-400",
  },
  low: {
    label: "Low",
    icon: "ℹ️",
    badgeClass: "bg-green-500/20 text-green-300 border-green-500/60",
    dotClass: "bg-green-400",
  },
};

const FLAG_PRESETS = [
  { label: "Guards dispatched", icon: "🛡️", flagType: "guards-dispatched", priority: "high" as const },
  { label: "Suspicious activity", icon: "👁️", flagType: "suspicious", priority: "critical" as const },
  { label: "Access verified", icon: "✅", flagType: "access-verified", priority: "low" as const },
  { label: "Technical fault", icon: "🔧", flagType: "technical-fault", priority: "medium" as const },
  { label: "VIP arrival", icon: "⭐", flagType: "vip-arrival", priority: "medium" as const },
  { label: "Area cleared", icon: "✔️", flagType: "area-cleared", priority: "low" as const },
];

function timeAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function CameraAnnotationPanel({
  cameraId,
  cameraName,
  operatorName = "Operator",
  isOpen,
  onClose,
}: CameraAnnotationPanelProps) {
  const [noteText, setNoteText] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [selectedPreset, setSelectedPreset] = useState<typeof FLAG_PRESETS[0] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newAnnotationId, setNewAnnotationId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { annotations, isLoading, addAnnotation, resolveAnnotation } = useLiveAnnotations(cameraId);

  // Auto-focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Use current timestamp in label placeholder
  const timestampPlaceholder = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  const handlePresetSelect = useCallback((preset: typeof FLAG_PRESETS[0]) => {
    setSelectedPreset(preset);
    setSelectedLabel(preset.label);
    setSelectedPriority(preset.priority);
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const note = noteText.trim();
    if (!note) return;
    setIsSubmitting(true);

    const result = await addAnnotation({
      label: selectedLabel || selectedPreset?.label || "Operator Note",
      note,
      flagType: selectedPreset?.flagType || "operator-note",
      priority: selectedPriority,
      pinned: true,
      authorName: operatorName,
    });

    setIsSubmitting(false);
    if (result) {
      setSubmitSuccess(true);
      setNewAnnotationId(result.id);
      setNoteText("");
      setSelectedPreset(null);
      setSelectedLabel("");
      setTimeout(() => setSubmitSuccess(false), 3000);
    }
  }, [noteText, selectedLabel, selectedPreset, selectedPriority, operatorName, addAnnotation]);

  const handleResolve = useCallback(
    async (ann: CameraAnnotation) => {
      await resolveAnnotation(ann.id);
    },
    [resolveAnnotation]
  );

  if (!isOpen) return null;

  const activeAnnotations = annotations.filter((a) => !a.resolvedAt);
  const resolvedAnnotations = annotations.filter((a) => !!a.resolvedAt);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-end p-4 pointer-events-none"
      role="dialog"
      aria-label="Camera Annotation Panel"
    >
      <div
        className="pointer-events-auto w-[400px] max-h-[90vh] flex flex-col rounded-2xl bg-zinc-900/97 border border-zinc-700/80 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-xl overflow-hidden"
        style={{ animation: "slideUpIn 0.25s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30">
              <MessageSquarePlus size={16} className="text-indigo-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                Live Operator Notes
                {activeAnnotations.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/25 text-indigo-300 border border-indigo-500/40">
                    {activeAnnotations.length} active
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400 truncate max-w-[230px]">{cameraName}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Live indicator */}
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <Radio size={9} className="animate-pulse" />
              LIVE SYNC
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Active Pins */}
        {activeAnnotations.length > 0 && (
          <div className="px-3 pt-3 pb-1 flex flex-col gap-2 overflow-y-auto max-h-56">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
              📌 Pinned Notes ({activeAnnotations.length})
            </div>
            {activeAnnotations.map((ann) => {
              const cfg = PRIORITY_CONFIGS[ann.priority as keyof typeof PRIORITY_CONFIGS] || PRIORITY_CONFIGS.medium;
              const isNew = ann.id === newAnnotationId;
              return (
                <div
                  key={ann.id}
                  className={`relative flex gap-2.5 p-2.5 rounded-xl border text-xs transition-all ${
                    isNew
                      ? "bg-indigo-950/60 border-indigo-500/60 shadow-[0_0_12px_rgba(99,102,241,0.3)]"
                      : "bg-zinc-800/60 border-zinc-700/60"
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${cfg.dotClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${cfg.badgeClass}`}>
                        {cfg.icon} {ann.label}
                      </span>
                      {isNew && (
                        <span className="text-[10px] font-bold text-indigo-400 animate-pulse">NEW</span>
                      )}
                    </div>
                    <p className="text-zinc-200 leading-snug break-words">{ann.note}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <User size={9} />
                        {ann.authorName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={9} />
                        {timeAgo(ann.createdAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Resolve & remove pin"
                    onClick={() => handleResolve(ann)}
                    className="shrink-0 p-1 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-950/40 transition-colors self-start"
                  >
                    <CheckCircle2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Compose Area */}
        <div className="px-3 pt-3 pb-2 border-t border-zinc-800/60 flex flex-col gap-2.5">
          {/* Quick Preset Badges */}
          <div className="flex flex-wrap gap-1.5">
            {FLAG_PRESETS.map((preset) => (
              <button
                key={preset.flagType}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold transition-all cursor-pointer ${
                  selectedPreset?.flagType === preset.flagType
                    ? "bg-indigo-600/40 border-indigo-400/70 text-indigo-200 shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                    : "bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700/60"
                }`}
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          {/* Priority selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider shrink-0">Priority:</span>
            <div className="flex gap-1">
              {(["low", "medium", "high", "critical"] as const).map((p) => {
                const cfg = PRIORITY_CONFIGS[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPriority(p)}
                    className={`px-2 py-0.5 rounded-full border text-[10px] font-bold transition-all ${
                      selectedPriority === p
                        ? cfg.badgeClass
                        : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={`e.g. "Guards dispatched to Gate 3 – ${timestampPlaceholder}"\nCtrl+Enter to send`}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 resize-none transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!noteText.trim() || isSubmitting}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all ${
              submitSuccess
                ? "bg-emerald-700/60 border border-emerald-500/70 text-emerald-200"
                : "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
            }`}
          >
            {submitSuccess ? (
              <>
                <CheckCircle2 size={14} />
                Pinned & Synced to All Operators ✓
              </>
            ) : isSubmitting ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <Pin size={13} />
                Pin Note (Ctrl+Enter)
                <Send size={12} className="ml-auto opacity-60" />
              </>
            )}
          </button>
        </div>

        {/* Resolved history toggle */}
        {resolvedAnnotations.length > 0 && (
          <div className="px-3 pb-3 border-t border-zinc-800/50 pt-2">
            <button
              type="button"
              onClick={() => setShowHistory((p) => !p)}
              className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors font-semibold uppercase tracking-wider"
            >
              {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Resolved ({resolvedAnnotations.length})
            </button>
            {showHistory && (
              <div className="mt-2 flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                {resolvedAnnotations.map((ann) => (
                  <div
                    key={ann.id}
                    className="flex items-start gap-2 p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/40 text-[10px] text-zinc-500 line-through"
                  >
                    <CheckCircle2 size={10} className="text-emerald-600 mt-0.5 shrink-0" />
                    <span className="break-words">{ann.note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live sync footer */}
        <div className="px-4 py-2 bg-zinc-950/60 border-t border-zinc-800/40 flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">All shifts & operators see these in real-time</span>
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <Shield size={9} />
            Shift-persistent log
          </span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUpIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      ` }} />
    </div>
  );
}
