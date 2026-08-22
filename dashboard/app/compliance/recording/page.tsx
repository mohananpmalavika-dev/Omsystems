"use client";

import React from "react";
import { RetentionComplianceDashboard } from "../../../components/retention/retention-compliance-dashboard";

export default function RecordingCompliancePage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <RetentionComplianceDashboard />
      </div>
    </div>
  );
}
