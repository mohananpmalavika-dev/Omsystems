import React from "react";
import { ZeroTouchOnboardingView } from "@/components/zero-touch-onboarding-view";
import { ErrorBoundary } from "@/components/error-boundary";

export const metadata = {
  title: "Zero-Touch Provisioning (ZTP) Control Plane | Sentinel Grid",
  description: "Provision branch edge agents, discover devices, validate video streams, and activate monitoring from one control plane.",
};

export default function ZeroTouchPage() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center">
              Zero-Touch Provisioning Control Plane
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Discover and provision branch devices through authenticated edge agents, with live validation and operator review.
            </p>
          </div>
          <ZeroTouchOnboardingView />
        </div>
      </div>
    </ErrorBoundary>
  );
}
