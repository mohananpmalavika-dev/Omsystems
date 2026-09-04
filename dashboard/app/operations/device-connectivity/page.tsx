import React from "react";
import { DeviceConnectivityView } from "@/components/device-connectivity-view";

export const metadata = {
  title: "Device Connectivity & 8-Factor Verification | KryptonVision",
  description: "Enterprise Device Adapters, Progressive Fingerprinting, 0-100 Connectivity Scoring, and Hardware Model Certifications",
};

export default function DeviceConnectivityPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <DeviceConnectivityView />
      </div>
    </div>
  );
}
