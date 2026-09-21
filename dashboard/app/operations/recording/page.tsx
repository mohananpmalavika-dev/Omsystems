import Link from "next/link";
import { HardDrive, Database, ArrowRight } from "lucide-react";
import { ComponentDetailPage } from "@/components/operational-health/component-detail-page";
import { RetentionFleetWidget } from "@/components/operational-health/retention-fleet-widget";

export default function Page() {
  return (
    <div className="space-y-6">
      {/* 3-Tier Storage Architecture Direct Banner */}
      <div className="p-4 rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-900/40 via-slate-900/60 to-slate-950 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              3-Tier Storage Auto-Detection &amp; Cloud Fallback Architecture
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                Active
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Footage records locally if device has its own storage (Camera SD Card or DVR/NVR HDD). If device storage is absent, it automatically records into the Sentinel Online Cloud Pool.
            </p>
          </div>
        </div>
        <Link
          href="/operations/storage"
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
        >
          <HardDrive className="w-4 h-4" />
          <span>Inspect Storage &amp; HDDs</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <RetentionFleetWidget detailed />
      <ComponentDetailPage title="Recording and retention health" component="recording" />
    </div>
  );
}
