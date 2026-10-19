"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { AnalyticsAlert, AnalyticsRule } from "@/lib/types";

export const ALERT_FOCUS_DURATION_MS = 3000;
const terminal = new Set(["resolved", "false_alarm", "suppressed"]);

// Draw attention without changing the camera order, stream or video colours.
export function useLiveWallAlertFocus(
  wall: RefObject<HTMLElement | null>,
  aiByCamera: ReadonlyMap<string, { rules: AnalyticsRule[]; alerts: AnalyticsAlert[] }> | undefined,
  enabled: boolean,
) {
  const seen = useRef(new Set<string>());
  const animations = useRef(new Map<string, Animation>());

  // Run after every commit so a newly mounted tile can receive its cue too.
  useEffect(() => {
    if (!enabled) {
      animations.current.forEach(animation => animation.cancel());
      animations.current.clear();
      return;
    }
    const candidates: Array<{ cameraId: string; alert: AnalyticsAlert; tile: HTMLElement }> = [];
    const tiles = new Map(Array.from(wall.current?.querySelectorAll<HTMLElement>("[data-camera-id]") ?? [])
      .map(tile => [tile.dataset.cameraId, tile]));
    for (const [cameraId, data] of aiByCamera ?? []) {
      const tile = tiles.get(cameraId);
      if (!tile) continue;
      for (const alert of data.alerts) {
        if (seen.current.has(alert.id)) continue;
        seen.current.add(alert.id);
        if (!terminal.has(alert.status) && !["P4", "P5"].includes(alert.severity)) {
          candidates.push({ cameraId, alert, tile });
        }
      }
    }
    // A polling batch gets one focus target; old open alerts cannot refocus it.
    candidates.sort((a, b) => a.alert.severity.localeCompare(b.alert.severity)
      || (Date.parse(b.alert.firstDetectedAt || b.alert.createdAt) || 0) - (Date.parse(a.alert.firstDetectedAt || a.alert.createdAt) || 0));
    const target = candidates[0];
    if (!target) return;
    target.tile.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    animations.current.get(target.cameraId)?.cancel();
    const animation = target.tile.animate([
      { outlineColor: "transparent" },
      { outlineColor: "#38bdf8", offset: 0.15 },
      { outlineColor: "#38bdf8", offset: 0.7 },
      { outlineColor: "transparent" },
    ].map(frame => ({ ...frame, outlineStyle: "solid", outlineWidth: "3px", outlineOffset: "-3px" })),
    { duration: ALERT_FOCUS_DURATION_MS, easing: "ease-out" });
    animations.current.set(target.cameraId, animation);
    animation.onfinish = () => {
      if (animations.current.get(target.cameraId) === animation) animations.current.delete(target.cameraId);
    };
  });

  useEffect(() => () => {
    animations.current.forEach(animation => animation.cancel());
    animations.current.clear();
    seen.current.clear();
  }, []);
}
