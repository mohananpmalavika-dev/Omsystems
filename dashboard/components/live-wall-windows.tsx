"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MonitorUp, X } from "lucide-react";
import { liveWallWindowUrl, type LiveWallWindowScope } from "@/lib/live-wall-windows";
import styles from "./live-wall-windows.module.css";

type WallWindow = { id: number; label: string; cameraCount: number; window: Window };

export function LiveWallWindows({ scope, label, cameraCount, disabled }: {
  scope: LiveWallWindowScope; label: string; cameraCount: number; disabled: boolean;
}) {
  const [windows, setWindows] = useState<WallWindow[]>([]);
  const [blockedUrl, setBlockedUrl] = useState<string>();
  const nextId = useRef(1);
  useEffect(() => {
    if (!windows.length) return;
    const timer = window.setInterval(() => {
      setWindows(current => current.some(wall => wall.window.closed) ? current.filter(wall => !wall.window.closed) : current);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [windows.length]);

  function openWall() {
    const url = liveWallWindowUrl(scope);
    // A fresh window on every click keeps previously opened selections independent.
    const child = window.open(url, "_blank", "popup,width=1440,height=900,resizable=yes,scrollbars=yes");
    if (!child) { setBlockedUrl(url); return; }
    child.opener = null;
    setBlockedUrl(undefined);
    const wall = { id: nextId.current++, label, cameraCount, window: child };
    setWindows(current => [...current, wall]);
  }

  return <section className={styles.root} aria-label="Multiple Live Wall windows">
    <div className={styles.toolbar}>
      <div><strong>Live Wall windows</strong><p>Combine your selected locations in a new window. Change the selection to open another wall.</p></div>
      <button type="button" className={styles.open} onClick={openWall} disabled={disabled}><MonitorUp size={16} />Open wall window<span>({cameraCount} camera{cameraCount === 1 ? "" : "s"})</span></button>
    </div>
    {blockedUrl && <p className={styles.blocked} role="alert">The browser blocked this window. Allow pop-ups for this site or <a href={blockedUrl} target="_blank" rel="noopener noreferrer">open the selected wall in a new tab</a>.</p>}
    {!!windows.length && <div className={styles.windows} aria-label="Open wall windows">
      {windows.map(wall => <div key={wall.id} className={styles.window}>
        <button type="button" className={styles.focus} title={wall.label} onClick={() => wall.window.focus()}><ExternalLink size={14} /><span>Wall {wall.id}: {wall.label}</span><small>{wall.cameraCount} camera{wall.cameraCount === 1 ? "" : "s"} at opening</small></button>
        <button type="button" className={styles.close} aria-label={`Close wall ${wall.id}`} onClick={() => { wall.window.close(); setWindows(current => current.filter(item => item.id !== wall.id)); }}><X size={14} /></button>
      </div>)}
    </div>}
  </section>;
}
