import React from "react";
import { MaintenanceCommandCenter } from "@/components/maintenance-command-center";

export const metadata = {
  title: "Field Service & Maintenance Command Center | Sentinel Grid",
  description: "Enterprise Surveillance Maintenance, Automated Diagnostics, Field Work Orders & Spare Management",
};

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <MaintenanceCommandCenter />
      </div>
    </div>
  );
}
