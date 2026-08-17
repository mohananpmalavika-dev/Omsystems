import React from "react";
import { ZeroTouchOnboardingView } from "@/components/zero-touch-onboarding-view";

export const metadata = {
  title: "Zero-Touch Provisioning (ZTP) Control Plane | Sentinel Grid",
  description: "Enterprise Brownfield Fleet Provisioning for 500+ Branches: mTLS device self-enrollment, autonomous LAN discovery, channel extraction, stream validation, and live monitoring",
};

export default function ZeroTouchPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center">
            Zero-Touch Provisioning Control Plane
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Autonomous brownfield discovery and provisioning across 500+ bank branches. Zero manual camera IP configuration, mTLS mutual authentication, and live video pipeline validation.
          </p>
        </div>
        <ZeroTouchOnboardingView />
      </div>
    </div>
  );
}
