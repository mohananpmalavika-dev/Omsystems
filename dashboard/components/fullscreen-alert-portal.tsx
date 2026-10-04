"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep global alerts in the browser's visible fullscreen subtree. */
export function FullscreenAlertPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const updateTarget = () => setTarget(document.fullscreenElement ?? document.body);
    updateTarget();
    document.addEventListener("fullscreenchange", updateTarget);
    return () => document.removeEventListener("fullscreenchange", updateTarget);
  }, []);

  return target ? createPortal(<>{children}</>, target) : null;
}
