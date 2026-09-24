"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";

export interface ActiveIntervention {
  id: string;
  cameraId: string;
  type: "siren" | "strobe" | "floodlight" | "door_unlock";
  mode?: string;
  state: "active" | "completed" | "cancelled";
  durationSeconds: number;
  triggeredBy: string;
  reason?: string;
  timestamp: string;
  expiresAt?: string;
}

export function useCameraInterventions(cameraId?: string) {
  const [activeInterventions, setActiveInterventions] = useState<Record<string, ActiveIntervention[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll / refresh active interventions
  const fetchInterventions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/v1/cameras/interventions/all");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.activeInterventions) {
          setActiveInterventions(data.activeInterventions);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load active interventions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInterventions();

    // Setup WebSocket listener
    const socket = getSocket();
    const handleInterventionUpdate = (event: ActiveIntervention) => {
      setActiveInterventions((prev) => {
        const next = { ...prev };
        const camList = next[event.cameraId] ? [...next[event.cameraId]] : [];

        if (event.state === "completed" || event.state === "cancelled") {
          // Remove from active list
          next[event.cameraId] = camList.filter((item) => item.id !== event.id);
        } else {
          // Add or update active item
          const idx = camList.findIndex((item) => item.id === event.id);
          if (idx >= 0) {
            camList[idx] = event;
          } else {
            camList.unshift(event);
          }
          next[event.cameraId] = camList;
        }
        return next;
      });
    };

    socket.on("camera:intervention:updated", handleInterventionUpdate);

    // Refresh every 30s as safety heartbeat
    const interval = setInterval(() => {
      void fetchInterventions();
    }, 30000);

    return () => {
      socket.off("camera:intervention:updated", handleInterventionUpdate);
      clearInterval(interval);
    };
  }, [fetchInterventions]);

  // Trigger Deterrence Siren / Strobe / Floodlight
  const triggerSiren = useCallback(
    async (
      targetCamId: string,
      mode: "siren" | "strobe" | "floodlight" | "dual" = "dual",
      durationSeconds: number = 30,
      reason?: string
    ) => {
      try {
        const res = await fetch(`/v1/cameras/${encodeURIComponent(targetCamId)}/interventions/siren`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trigger", mode, durationSeconds, reason }),
        });
        const data = await res.json();
        if (data.success && data.intervention) {
          setActiveInterventions((prev) => {
            const list = prev[targetCamId] ? [...prev[targetCamId]] : [];
            return { ...prev, [targetCamId]: [data.intervention, ...list] };
          });
        }
        return data;
      } catch (err: any) {
        throw new Error(err?.message || "Failed to trigger deterrence");
      }
    },
    []
  );

  // Stop Siren
  const stopSiren = useCallback(async (targetCamId: string) => {
    try {
      const res = await fetch(`/v1/cameras/${encodeURIComponent(targetCamId)}/interventions/siren`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveInterventions((prev) => {
          const list = (prev[targetCamId] || []).filter(
            (i) => i.type !== "siren" && i.type !== "strobe" && i.type !== "floodlight"
          );
          return { ...prev, [targetCamId]: list };
        });
      }
      return data;
    } catch (err: any) {
      throw new Error(err?.message || "Failed to stop deterrence");
    }
  }, []);

  // Momentary Door Unlock
  const unlockDoor = useCallback(
    async (targetCamId: string, durationSeconds: number = 5, reason?: string) => {
      try {
        const res = await fetch(`/v1/cameras/${encodeURIComponent(targetCamId)}/interventions/door-unlock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSeconds, reason }),
        });
        const data = await res.json();
        if (data.success && data.intervention) {
          setActiveInterventions((prev) => {
            const list = prev[targetCamId] ? [...prev[targetCamId]] : [];
            return { ...prev, [targetCamId]: [data.intervention, ...list] };
          });
        }
        return data;
      } catch (err: any) {
        throw new Error(err?.message || "Failed to unlock door");
      }
    },
    []
  );

  // Return specific camera's active items if cameraId was passed
  const cameraActiveList = cameraId ? activeInterventions[cameraId] || [] : [];
  const isSirenActive = cameraActiveList.some((i) => i.type === "siren" || i.type === "dual" || i.mode === "dual");
  const isStrobeActive = cameraActiveList.some((i) => i.type === "strobe" || i.type === "floodlight");
  const isDoorUnlocked = cameraActiveList.some((i) => i.type === "door_unlock");

  return {
    activeInterventions,
    cameraActiveList,
    isSirenActive,
    isStrobeActive,
    isDoorUnlocked,
    triggerSiren,
    stopSiren,
    unlockDoor,
    refresh: fetchInterventions,
    loading,
    error,
  };
}
