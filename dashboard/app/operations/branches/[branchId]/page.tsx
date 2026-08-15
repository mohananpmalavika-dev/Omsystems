"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { BranchCommandCenter } from "@/components/branch-command-center/branch-command-center";

export default function BranchOperationsPage() {
  const params = useParams();
  const router = useRouter();
  const branchId = typeof params?.branchId === "string" ? params.branchId : "branch-178";

  const handleBackToHo = () => {
    router.push("/operational-health");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <BranchCommandCenter
        branchId={branchId}
        onBackToHo={handleBackToHo}
      />
    </div>
  );
}
