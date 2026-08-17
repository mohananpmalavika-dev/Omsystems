import React from "react";
import { ZeroTouchOnboardingView } from "@/components/zero-touch-onboarding-view";

export const metadata = {
  title: "Zero-Touch Brownfield Automated Onboarding | Sentinel Grid",
  description: "Autonomous Branch Camera Onboarding for 500+ Branches: Single-use enrollment codes, 1-line unattended installers, and zero manual camera IP configuration",
};

export default function ZeroTouchPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Zero-Touch Brownfield Automated Onboarding (V2)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            “No technician needs to manually enter 20 camera IP addresses.” Unattended 1-line installer, multi-protocol discovery, multi-channel NVR extraction, and instant live monitoring in &lt;90 seconds.
          </p>
        </div>
        <ZeroTouchOnboardingView />
      </div>
    </div>
  );
}
