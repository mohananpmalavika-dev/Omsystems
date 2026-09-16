"use client";

import React, { useEffect, useState } from "react";
import { AlertOctagon, Siren, Eye, CheckCircle, ExternalLink, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";

export interface EmergencyAlarm {
  id: string;
  cameraId: string;
  cameraName: string;
  branchName?: string;
  eventType: string;
  severity: "P1" | "P2";
  timestamp: string;
  thumbnailUrl?: string;
}

interface EmergencyAlarmPopupProps {
  onSpotlightCamera?: (cameraId: string) => void;
  className?: string;
}

export function EmergencyAlarmPopup({
  onSpotlightCamera,
  className = "",
}: EmergencyAlarmPopupProps) {
  const [activeAlarm, setActiveAlarm] = useState<EmergencyAlarm | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Poll or listen for critical P1 alarms
  useEffect(() => {
    let isMounted = true;

    const checkP1Alerts = async () => {
      try {
        const res = await fetch("/api/v1/alerts?severity=P1&status=OPEN&limit=1");
        if (!res.ok) return;
        const data = await res.json();
        const alertList = data.data || data.alerts || [];

        if (alertList.length > 0 && isMounted) {
          const first = alertList[0];
          setActiveAlarm((prev) => {
            if (prev?.id === first.id) return prev;
            setAcknowledged(false);
            return {
              id: first.id,
              cameraId: first.cameraId || first.sourceId,
              cameraName: first.cameraName || first.title || "Critical Camera",
              branchName: first.branchName || "Main Vault / Branch",
              eventType: first.type || first.eventType || "CRITICAL_INTRUSION_DETECTED",
              severity: "P1",
              timestamp: first.createdAt || new Date().toISOString(),
            };
          });
        }
      } catch {
        // network or auth error
      }
    };

    const interval = setInterval(checkP1Alerts, 6000);
    checkP1Alerts();

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleAcknowledge = async () => {
    if (!activeAlarm) return;
    try {
      await fetch(`/api/v1/alerts/${activeAlarm.id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      setAcknowledged(true);
      setTimeout(() => setActiveAlarm(null), 1200);
    } catch {
      setActiveAlarm(null);
    }
  };

  if (!activeAlarm) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-full px-4 animate-in fade-in slide-in-from-top-4 duration-300 ${className}`}
    >
      <div className="bg-neutral-950/95 border-2 border-red-600 rounded-xl p-3.5 shadow-[0_0_40px_rgba(220,38,38,0.45)] backdrop-blur-xl flex items-center justify-between gap-4 text-white">
        {/* Left: Flashing siren beacon */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-lg bg-red-600/20 border border-red-500/50 text-red-500">
            <span className="absolute inset-0 rounded-lg bg-red-500/30 animate-ping" />
            <Siren className="w-6 h-6 relative z-10 animate-bounce" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider animate-pulse">
                P1 EMERGENCY
              </span>
              <span className="text-xs text-neutral-400 font-mono">
                {new Date(activeAlarm.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <h4 className="font-bold text-sm text-neutral-100 mt-0.5">
              {activeAlarm.eventType.replace(/_/g, " ")}
            </h4>
            <p className="text-xs text-neutral-400">
              {activeAlarm.cameraName} • <span className="text-neutral-300">{activeAlarm.branchName}</span>
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {onSpotlightCamera && (
            <button
              onClick={() => onSpotlightCamera(activeAlarm.cameraId)}
              className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              Spotlight Tile
            </button>
          )}

          <Link
            href={`/incidents/create?alertId=${activeAlarm.id}&cameraId=${activeAlarm.cameraId}`}
            className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            SOP Playbook
          </Link>

          <button
            onClick={handleAcknowledge}
            disabled={acknowledged}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {acknowledged ? "Acknowledged" : "Acknowledge"}
          </button>

          <button
            onClick={() => setIsMuted((m) => !m)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
            title={isMuted ? "Unmute Alarm" : "Mute Alarm"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            onClick={() => setActiveAlarm(null)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
            title="Dismiss Notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
