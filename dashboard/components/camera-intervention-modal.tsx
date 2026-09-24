"use client";

import { useState, useEffect } from "react";
import {
  Siren,
  Lock,
  Unlock,
  Lightbulb,
  Radio,
  Volume2,
  X,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useCameraInterventions, ActiveIntervention } from "@/hooks/useCameraInterventions";

interface CameraInterventionModalProps {
  cameraId: string;
  cameraName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CameraInterventionModal({
  cameraId,
  cameraName,
  isOpen,
  onClose,
}: CameraInterventionModalProps) {
  const {
    cameraActiveList,
    isSirenActive,
    isStrobeActive,
    isDoorUnlocked,
    triggerSiren,
    stopSiren,
    unlockDoor,
  } = useCameraInterventions(cameraId);

  const [sirenDuration, setSirenDuration] = useState(30);
  const [doorDuration, setDoorDuration] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  // Fetch audit history on open
  useEffect(() => {
    if (!isOpen) return;
    fetch(`/v1/cameras/${encodeURIComponent(cameraId)}/interventions/history`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.history) setHistory(data.history);
      })
      .catch(() => undefined);
  }, [isOpen, cameraId]);

  if (!isOpen) return null;

  const handleSirenToggle = async () => {
    setSubmitting(true);
    try {
      if (isSirenActive) {
        await stopSiren(cameraId);
        setFeedback("🚨 Siren deterrence stopped");
      } else {
        await triggerSiren(cameraId, "dual", sirenDuration, "Operator Live Wall Intervention");
        setFeedback(`🚨 Siren & Strobe triggered for ${sirenDuration}s`);
      }
    } catch (err: any) {
      setFeedback(`❌ Error: ${err.message}`);
    } finally {
      setSubmitting(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleFloodlightToggle = async () => {
    setSubmitting(true);
    try {
      if (isStrobeActive) {
        await stopSiren(cameraId);
        setFeedback("💡 Floodlight deterrence stopped");
      } else {
        await triggerSiren(cameraId, "floodlight", 60, "Operator Floodlight Deterrence");
        setFeedback("💡 White Floodlight activated for 60s");
      }
    } catch (err: any) {
      setFeedback(`❌ Error: ${err.message}`);
    } finally {
      setSubmitting(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleDoorUnlock = async () => {
    setSubmitting(true);
    try {
      await unlockDoor(cameraId, doorDuration, "Operator verified door release");
      setFeedback(`🔓 Door released for ${doorDuration}s (Auto-relock engaged)`);
    } catch (err: any) {
      setFeedback(`❌ Error: ${err.message}`);
    } finally {
      setSubmitting(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-100 flex flex-col gap-5 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <Siren size={22} className={isSirenActive ? "animate-bounce text-rose-500" : ""} />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100 flex items-center gap-2">
                Instant Operator Interventions
                <span className="text-[10px] font-mono uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full">
                  Direct Action
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Camera: <span className="font-mono text-cyan-400">{cameraName || cameraId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feedback alert banner */}
        {feedback && (
          <div className="p-3 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-200 text-xs flex items-center gap-2">
            <Sparkles size={14} className="text-cyan-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Main Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Action 1: Siren & Strobe */}
          <div
            className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
              isSirenActive
                ? "bg-rose-950/50 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse"
                : "bg-slate-800/60 border-slate-700/70 hover:border-slate-600"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    isSirenActive ? "bg-rose-500 text-white" : "bg-slate-700/60 text-rose-400"
                  }`}
                >
                  <Siren size={18} />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-slate-200">110dB Edge Siren</h4>
                  <p className="text-[11px] text-slate-400">Acoustic & Strobe Deterrence</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <select
                value={sirenDuration}
                onChange={(e) => setSirenDuration(Number(e.target.value))}
                disabled={isSirenActive || submitting}
                className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
              >
                <option value={15}>15 Seconds</option>
                <option value={30}>30 Seconds</option>
                <option value={60}>60 Seconds</option>
              </select>

              <button
                type="button"
                onClick={handleSirenToggle}
                disabled={submitting}
                className={`flex-1 font-medium text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  isSirenActive
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-lg"
                    : "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40"
                }`}
              >
                <Siren size={14} />
                <span>{isSirenActive ? "STOP SIREN" : "TRIGGER SIREN"}</span>
              </button>
            </div>
          </div>

          {/* Action 2: Door Unlock / Access Control Interlock */}
          <div
            className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
              isDoorUnlocked
                ? "bg-emerald-950/50 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                : "bg-slate-800/60 border-slate-700/70 hover:border-slate-600"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    isDoorUnlocked ? "bg-emerald-500 text-white" : "bg-slate-700/60 text-emerald-400"
                  }`}
                >
                  {isDoorUnlocked ? <Unlock size={18} /> : <Lock size={18} />}
                </div>
                <div>
                  <h4 className="font-medium text-sm text-slate-200">Access Control Interlock</h4>
                  <p className="text-[11px] text-slate-400">Momentary Door Release</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <select
                value={doorDuration}
                onChange={(e) => setDoorDuration(Number(e.target.value))}
                disabled={isDoorUnlocked || submitting}
                className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
              >
                <option value={3}>3s Pulse</option>
                <option value={5}>5s Pulse</option>
                <option value={10}>10s Pulse</option>
              </select>

              <button
                type="button"
                onClick={handleDoorUnlock}
                disabled={submitting || isDoorUnlocked}
                className={`flex-1 font-medium text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  isDoorUnlocked
                    ? "bg-emerald-600 text-white cursor-default"
                    : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
                }`}
              >
                {isDoorUnlocked ? <CheckCircle2 size={14} /> : <Unlock size={14} />}
                <span>{isDoorUnlocked ? "DOOR RELEASED" : "UNLOCK DOOR"}</span>
              </button>
            </div>
          </div>

          {/* Action 3: White Floodlight / Visual Deterrence */}
          <div
            className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
              isStrobeActive
                ? "bg-amber-950/50 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                : "bg-slate-800/60 border-slate-700/70 hover:border-slate-600"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg ${
                  isStrobeActive ? "bg-amber-500 text-black" : "bg-slate-700/60 text-amber-400"
                }`}
              >
                <Lightbulb size={18} />
              </div>
              <div>
                <h4 className="font-medium text-sm text-slate-200">White Floodlight</h4>
                <p className="text-[11px] text-slate-400">High-Lux Illuminator Strobe</p>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={handleFloodlightToggle}
                disabled={submitting}
                className={`w-full font-medium text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  isStrobeActive
                    ? "bg-amber-500 hover:bg-amber-600 text-black font-semibold shadow-lg"
                    : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40"
                }`}
              >
                <Lightbulb size={14} />
                <span>{isStrobeActive ? "TURN OFF FLOODLIGHT" : "ACTIVATE FLOODLIGHT (60s)"}</span>
              </button>
            </div>
          </div>

          {/* Action 4: Push-to-Talk / Voice Deterrence Notice */}
          <div className="p-4 rounded-xl border bg-slate-800/60 border-slate-700/70 flex flex-col justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-slate-700/60 text-cyan-400">
                <Volume2 size={18} />
              </div>
              <div>
                <h4 className="font-medium text-sm text-slate-200">Live 2-Way Audio Mic</h4>
                <p className="text-[11px] text-slate-400">Direct Speaker Push-to-Talk</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between bg-slate-900/80 p-2.5 rounded-lg border border-slate-700/50">
              <span className="text-[11px] text-slate-400">Use Mic button on Live Tile toolbar</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Active on Tile
              </span>
            </div>
          </div>
        </div>

        {/* Audit Log / History */}
        <div className="border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-medium">
            <span className="flex items-center gap-1">
              <Clock size={13} />
              Recent Interventions Audit Trail
            </span>
            <span className="text-[10px] text-slate-500">Immutable Compliance Log</span>
          </div>

          <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
            {history.length === 0 ? (
              <p className="text-slate-500 italic py-2 text-center text-xs">No recent interventions recorded on this camera.</p>
            ) : (
              history.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800/60 text-slate-300"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        item.type === "door_unlock"
                          ? "bg-emerald-400"
                          : item.type === "siren"
                          ? "bg-rose-400"
                          : "bg-amber-400"
                      }`}
                    />
                    <span className="uppercase font-semibold text-[10px] text-slate-200">
                      {item.type?.replace("_", " ")}
                    </span>
                    <span className="text-slate-400 truncate max-w-[200px]">{item.reason || item.triggered_by}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {item.created_at ? new Date(item.created_at).toLocaleTimeString() : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
