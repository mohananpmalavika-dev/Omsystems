"use client";

import { useState } from "react";
import { AlertTriangle, Info, Network, RefreshCw } from "lucide-react";
import { TopologyVisualization } from "./TopologyVisualization";

/** A read-only operational view backed by control-plane inventory and telemetry. */
export function DigitalTwinPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><Network className="h-4 w-4" aria-hidden="true" />LIVE INFRASTRUCTURE TWIN</div>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Infrastructure topology</h1>
            <p className="mt-1 text-sm text-gray-600">Current inventory and telemetry, limited to branches you are permitted to view.</p>
          </div>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh data
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6" aria-labelledby="topology-heading">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="topology-heading" className="text-xl font-semibold text-gray-900">Dependency topology</h2>
              <p className="mt-1 text-sm text-gray-600">Select a component to inspect its control-plane identifier.</p>
            </div>
            {selectedAssetId && <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">Selected asset: <span className="font-mono font-semibold">{selectedAssetId}</span></div>}
          </div>
          <TopologyVisualization key={refreshKey} onNodeClick={setSelectedAssetId} />
        </section>

        <aside className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950" aria-label="Topology data guidance">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
          <p>Health is based on the latest available telemetry. A gray node means the asset is known from inventory but has no current health evidence; it is not assumed healthy.</p>
        </aside>
        <aside className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" aria-label="Operational safety guidance">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <p>Use the incident and maintenance workspaces for remediation. This view does not make infrastructure changes.</p>
        </aside>
      </div>
    </main>
  );
}
