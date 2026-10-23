"use client";

import { useEffect, useState } from "react";
import { Eye, Shield, X, Sparkles } from "lucide-react";

interface EyeCareMicroBreakOverlayProps {
  secondsLeft: number;
  onExit: () => void;
}

export function EyeCareMicroBreakOverlay({ secondsLeft, onExit }: EyeCareMicroBreakOverlayProps) {
  const [breathPhase, setBreathPhase] = useState<"Inhale..." | "Hold..." | "Exhale..." | "Rest...">("Inhale...");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        onExit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  // Gentle 4-second breathing cycle
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cycle = Math.floor(Date.now() / 3000) % 3;
      if (cycle === 0) setBreathPhase("Inhale...");
      else if (cycle === 1) setBreathPhase("Hold...");
      else setBreathPhase("Exhale...");
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = Math.max(0, Math.min(100, ((20 - secondsLeft) / 20) * 100));
  const strokeDashoffset = 283 - (283 * progress) / 100;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-slate-950/92 backdrop-blur-xl text-slate-100 select-none animate-in fade-in duration-500"
      role="dialog"
      aria-modal="true"
      aria-label="20-20-20 Eye-Care Micro Break"
      onClick={onExit}
    >
      {/* Background soft ambient glow */}
      <div className="absolute w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div
        className="relative max-w-lg w-full bg-slate-900/95 border border-emerald-500/40 rounded-3xl p-8 shadow-2xl text-center flex flex-col items-center gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-semibold tracking-wide">
          <Eye size={14} className="text-emerald-400 animate-pulse" />
          <span>THE 20-20-20 RULE · EYE REST BREAK</span>
        </div>

        {/* Circular Countdown Ring & Breathing Animation */}
        <div className="relative w-44 h-44 flex items-center justify-center">
          {/* Animated pulsing outer ring */}
          <div className="absolute inset-0 rounded-full bg-emerald-500/15 animate-ping opacity-40 duration-1000" />
          <div className="absolute inset-2 rounded-full border border-emerald-500/20 bg-slate-950/80" />

          {/* SVG Progress Ring */}
          <svg className="w-40 h-40 transform -rotate-90">
            <circle
              cx="80"
              cy="80"
              r="45"
              stroke="currentColor"
              strokeWidth="6"
              className="text-slate-800"
              fill="transparent"
            />
            <circle
              cx="80"
              cy="80"
              r="45"
              stroke="currentColor"
              strokeWidth="6"
              className="text-emerald-400 transition-all duration-1000 ease-linear"
              fill="transparent"
              strokeDasharray="283"
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>

          {/* Central Counter & Breath Text */}
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-4xl font-extrabold text-white font-mono tracking-tighter">
              {secondsLeft}s
            </span>
            <span className="text-xs font-medium text-emerald-400 transition-opacity duration-300">
              {breathPhase}
            </span>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>Look 20 feet (6m) away</span>
            <Sparkles size={16} className="text-emerald-400" />
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">
            Gaze away from your monitors toward a distant wall, window, or hallway. Blink gently and let your eye focus muscles relax.
          </p>
        </div>

        {/* Security Armed Indicator */}
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-950/90 border border-slate-700/80 text-xs text-slate-400 text-left w-full">
          <Shield size={16} className="text-emerald-400 shrink-0" />
          <span>
            <strong className="text-slate-200">Surveillance fully armed:</strong> Emergency sirens, motion alerts, and AI tripwires continue actively monitoring in the background.
          </span>
        </div>

        {/* Controls */}
        <button
          type="button"
          onClick={onExit}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all shadow-lg hover:shadow-emerald-900/40 cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Resume Live Wall Monitoring (Esc)</span>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
