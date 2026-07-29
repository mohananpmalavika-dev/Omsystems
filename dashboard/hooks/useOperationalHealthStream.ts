"use client";

import { useEffect, useRef, useState } from "react";

export interface OperationalHealthEvent {
  id: string;
  type: "health.updated" | "policy.updated";
  occurredAt: string;
  branchId?: string;
  deviceType?: string;
  deviceId?: string;
}

export function useOperationalHealthStream(onUpdate: (event: OperationalHealthEvent) => void, enabled = true) {
  const callback = useRef(onUpdate);
  const [connected, setConnected] = useState(false);
  useEffect(() => { callback.current = onUpdate; }, [onUpdate]);
  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    const stream = new EventSource("/api/control/v1/operations/events", { withCredentials: true });
    const handle = (message: MessageEvent<string>) => {
      try { callback.current(JSON.parse(message.data) as OperationalHealthEvent); } catch { /* polling resync remains active */ }
    };
    stream.addEventListener("ready", () => setConnected(true));
    stream.addEventListener("health.updated", handle as EventListener);
    stream.addEventListener("policy.updated", handle as EventListener);
    stream.onerror = () => setConnected(false);
    return () => { stream.close(); setConnected(false); };
  }, [enabled]);
  return connected;
}
