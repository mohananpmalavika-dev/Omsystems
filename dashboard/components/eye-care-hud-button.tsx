"use client";

import { useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Sun,
  Moon,
  Sparkles,
  Shield,
  Volume2,
  VolumeX,
  Sliders,
  Check,
  ChevronDown,
  Clock,
  X,
  Coffee,
} from "lucide-react";
import type { EyeCareMode, EyeCareSettings, EyeCareComputedState } from "@/lib/eye-care";
import { formatMonitoringDuration } from "@/lib/eye-care";

interface EyeCareHudButtonProps {
  settings: EyeCareSettings;
  computed: EyeCareComputedState;
  continuousMinutes: number;
  secondsUntilNextBreak: number;
  onUpdateSettings: (updates: Partial<EyeCareSettings>) => void;
  onStartMicroBreak: () => void;
}

export function EyeCareHudButton({
  settings,
  computed,
  continuousMinutes,
  secondsUntilNextBreak,
  onUpdateSettings,
  onStartMicroBreak,
}: EyeCareHudButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click or Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const modes: Array<{ id: EyeCareMode; label: string; desc: string; icon: typeof Eye }> = [
    {
      id: "auto",
      label: "Auto Circadian",
      desc: "Adapts to local day/dusk/night hours & softens progressive eye fatigue",
      icon: Sparkles,
    },
    {
      id: "warm",
      label: "Warm Amber",
      desc: "Strong blue-light cut (35-70%) to preserve melatonin & prevent eye strain",
      icon: Sun,
    },
    {
      id: "night",
      label: "Night Watch",
      desc: "Anti-glare for dark control rooms: subdued highlights & muted white glare",
      icon: Moon,
    },
    {
      id: "monochrome",
      label: "Monochrome",
      desc: "B&W high-contrast: eliminates color distraction & chromatic fatigue",
      icon: Eye,
    },
    {
      id: "custom",
      label: "Custom",
      desc: "Fine-tune warmth, brightness, and contrast to your workstation display",
      icon: Sliders,
    },
  ];

  const intervals = [
    { value: 15, label: "15 min" },
    { value: 20, label: "20 min (20-20-20 Rule)" },
    { value: 30, label: "30 min" },
    { value: 45, label: "45 min" },
    { value: 60, label: "60 min" },
    { value: 0, label: "Off" },
  ];

  const nextBreakMinutes = Math.ceil(secondsUntilNextBreak / 60);

  return (
    <div className="relative inline-block text-left" ref={panelRef}>
      {/* Trigger Button in Live Wall Toolbar */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none ${
          settings.enabled && settings.mode !== "off"
            ? "bg-amber-950/40 border-amber-500/70 text-amber-300 hover:bg-amber-950/60 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
            : "bg-slate-900 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        }`}
        title="Live Wall Eye-Care Mode: Circadian blue-light reduction & 20-20-20 rest tracker"
        aria-expanded={isOpen}
      >
        {settings.enabled && settings.mode !== "off" ? (
          <Eye size={14} className="text-amber-400" />
        ) : (
          <EyeOff size={14} />
        )}
        <span>Eye-Care</span>
        {settings.enabled && settings.mode !== "off" && (
          <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-200 font-mono">
            {settings.mode === "auto"
              ? `${computed.effectiveWarmth}%`
              : settings.mode === "monochrome"
              ? "B&W"
              : `${settings.mode}`}
          </span>
        )}
        {continuousMinutes > 0 && (
          <span
            className="text-[10px] text-slate-400 font-mono hidden sm:inline"
            title={`Continuous monitoring duration: ${formatMonitoringDuration(continuousMinutes)}`}
          >
            ⏱️{formatMonitoringDuration(continuousMinutes)}
          </span>
        )}
        <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Flyout Control Drawer */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 z-50 w-80 sm:w-96 rounded-2xl bg-slate-900/98 border border-slate-700/80 shadow-2xl backdrop-blur-2xl p-4 text-slate-200 animate-in fade-in zoom-in-95 duration-200 text-xs"
          role="dialog"
          aria-label="Auto Eye-Care Settings"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                <Eye size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">
                  Auto Eye-Care Engine
                </h3>
                <span className="text-[10px] text-slate-400">
                  Continuous Video Wall Monitor Health
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800"
              aria-label="Close Eye-Care Settings"
            >
              <X size={14} />
            </button>
          </div>

          {/* Master Enable Toggle */}
          <div className="flex items-center justify-between py-3 border-b border-slate-800/80">
            <div>
              <span className="font-semibold text-white block">Visual Protection</span>
              <span className="text-[11px] text-slate-400">
                {settings.enabled ? computed.phaseLabel : "Off (Standard Feed)"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ enabled: !settings.enabled })}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${
                settings.enabled ? "bg-emerald-600" : "bg-slate-700"
              }`}
              role="switch"
              aria-checked={settings.enabled}
              aria-label="Toggle Eye-Care Mode"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  settings.enabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {settings.enabled && (
            <div className="space-y-3.5 pt-3">
              {/* Preset Mode Selection */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1.5 uppercase tracking-wider">
                  Color &amp; Filter Profile
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {modes.map((m) => {
                    const Icon = m.icon;
                    const isSelected = settings.mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onUpdateSettings({ mode: m.id })}
                        className={`flex items-center gap-1.5 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-amber-500/20 border-amber-500/80 text-amber-200 shadow-sm"
                            : "bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                        }`}
                        title={m.desc}
                      >
                        <Icon size={14} className={isSelected ? "text-amber-400" : ""} />
                        <span className="font-semibold truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Fatigue Softener Notice */}
              {computed.fatigueCompensated && (
                <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-600/40 text-[11px] text-amber-300 flex items-center gap-2">
                  <Sparkles size={14} className="shrink-0 text-amber-400 animate-spin" />
                  <span>
                    <strong>Fatigue Softening Active:</strong> Softened contrast (+extra warmth) due to {formatMonitoringDuration(continuousMinutes)} continuous monitoring.
                  </span>
                </div>
              )}

              {/* Sliders (Active in Warm, Night, Custom) */}
              {settings.mode !== "monochrome" && (
                <div className="space-y-2.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  {/* Warmth / Blue-Light Cut Slider */}
                  <div>
                    <div className="flex justify-between items-center text-[11px] mb-1 font-medium">
                      <span className="text-slate-300">Warmth (Blue-Light Filter)</span>
                      <span className="text-amber-400 font-mono">{computed.effectiveWarmth}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={settings.warmth}
                      onChange={(e) => onUpdateSettings({ warmth: Number(e.target.value), mode: settings.mode === "auto" ? "custom" : settings.mode })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                  </div>

                  {/* Glare Brightness Slider */}
                  <div>
                    <div className="flex justify-between items-center text-[11px] mb-1 font-medium">
                      <span className="text-slate-300">Glare Attenuation (Brightness)</span>
                      <span className="text-sky-400 font-mono">{computed.effectiveBrightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="65"
                      max="100"
                      value={settings.brightness}
                      onChange={(e) => onUpdateSettings({ brightness: Number(e.target.value), mode: settings.mode === "auto" ? "custom" : settings.mode })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                    />
                  </div>
                </div>
              )}

              {/* Continuous Monitoring & The 20-20-20 Rule Section */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-emerald-400" />
                    <span className="font-bold text-white text-[11px]">Continuous Stare Tracker</span>
                  </div>
                  <span className="text-emerald-400 font-mono font-bold text-[11px]">
                    {formatMonitoringDuration(continuousMinutes)}
                  </span>
                </div>

                {/* Reminder Interval Select */}
                <div>
                  <div className="flex justify-between items-center text-[11px] mb-1">
                    <span className="text-slate-400">Micro-Break Interval</span>
                    {settings.restReminderIntervalMin > 0 && (
                      <span className="text-slate-300">
                        Next in ~{nextBreakMinutes}m
                      </span>
                    )}
                  </div>
                  <select
                    value={settings.restReminderIntervalMin}
                    onChange={(e) => onUpdateSettings({ restReminderIntervalMin: Number(e.target.value) })}
                    className="w-full p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    {intervals.map((iv) => (
                      <option key={iv.value} value={iv.value}>
                        {iv.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Take Break Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onStartMicroBreak();
                  }}
                  className="w-full py-1.5 px-3 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow transition-colors cursor-pointer"
                >
                  <Coffee size={13} />
                  <span>Take 20s Eye Rest Break Now</span>
                </button>
              </div>

              {/* Secondary Ergonomics Options */}
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                  <span>Subdue Inactive UI Chrome &amp; Neon Borders</span>
                  <input
                    type="checkbox"
                    checked={settings.dimInactiveChrome}
                    onChange={(e) => onUpdateSettings({ dimInactiveChrome: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                  <span>Anti-Flicker Alert Mode (Gentle Glow Pulses)</span>
                  <input
                    type="checkbox"
                    checked={settings.antiFlickerAlarms}
                    onChange={(e) => onUpdateSettings({ antiFlickerAlarms: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                  <span>Soft Harmonic Chime on Micro-Rest Reminders</span>
                  <input
                    type="checkbox"
                    checked={settings.soundAlertOnBreak}
                    onChange={(e) => onUpdateSettings({ soundAlertOnBreak: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
