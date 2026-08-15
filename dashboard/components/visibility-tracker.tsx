/**
 * Visibility Tracker Component
 * Tracks camera tile visibility using IntersectionObserver
 */

import { useEffect, useRef } from "react";

export interface VisibilityTrackerProps {
  cameraId: string;
  onVisibilityChange: (cameraId: string, visible: boolean) => void;
  children: React.ReactNode;
  threshold?: number;
  rootMargin?: string;
}

export function VisibilityTracker({
  cameraId,
  onVisibilityChange,
  children,
  threshold = 0.1,
  rootMargin = "50px",
}: VisibilityTrackerProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Create observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          onVisibilityChange(cameraId, entry.isIntersecting);
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    // Observe element
    observerRef.current.observe(element);

    // Cleanup
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [cameraId, onVisibilityChange, threshold, rootMargin]);

  return (
    <div ref={elementRef} data-camera-id={cameraId}>
      {children}
    </div>
  );
}
