"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AdaptiveVideoWall } from "@/components/adaptive-video-wall";
import { AlertTriangle, Info, X } from "lucide-react";

export default function VideoWallPage() {
  const [showBanner, setShowBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");

  useEffect(() => {
    // Check if user is likely not authenticated
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setShowBanner(true);
      setBannerMessage("authentication");
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {showBanner && bannerMessage === "authentication" && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
            <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-200">Authentication Required</h3>
              <p className="text-xs text-amber-300 mt-1">
                You may need to log in to view live camera feeds.{" "}
                <Link href="/login" className="underline hover:text-amber-100">
                  Sign in here
                </Link>
                {" "}or{" "}
                <Link href="/diagnostics" className="underline hover:text-amber-100">
                  run diagnostics
                </Link>
                .
              </p>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="text-amber-300 hover:text-amber-100"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4 flex items-start gap-3">
          <Info className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-200">Troubleshooting</h3>
            <p className="text-xs text-blue-300 mt-1">
              If videos aren't loading, visit the{" "}
              <Link href="/diagnostics" className="underline hover:text-blue-100">
                diagnostics page
              </Link>
              {" "}to check your system configuration and connectivity.
            </p>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Live Video Wall
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Live camera inventory from the control plane. Streams are authorized per camera and started only when available.
          </p>
        </div>
        <AdaptiveVideoWall />
      </div>
    </div>
  );
}
