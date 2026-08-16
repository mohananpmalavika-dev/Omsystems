"use client";

import { AppLayout } from "@/components/app-layout";
import { AIQualityRegistry } from "@/components/ai-quality-registry";

export default function AIQualityPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">AI Model Quality & Certification Registry</h1>
          <p className="text-sm text-slate-400 mt-1">
            Production-certified computer vision models, benchmark evaluation curves, hardware profiles, and real-time fleet drift monitor.
          </p>
        </div>

        <AIQualityRegistry />
      </div>
    </AppLayout>
  );
}
