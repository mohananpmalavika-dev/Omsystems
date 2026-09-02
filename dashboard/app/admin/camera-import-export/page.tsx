"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";
import { CameraImportExportModal } from "@/components/camera-import-export-modal";
import {
  FileSpreadsheet,
  Upload,
  Download,
  Camera,
  ArrowLeft,
  CheckCircle2,
  Server,
  Layers,
  ShieldCheck,
  RefreshCw,
  Plus,
  HelpCircle,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { cameraInventoryApi } from "@/lib/api-client";

export default function CameraImportExportPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [cameras, setCameras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const bRes = await cameraInventoryApi.listBranches();
      const bList = bRes?.data || [];
      const mappedBranches = bList.map((b: any) => ({
        id: b.id || b.branchId || b.code,
        name: b.name || b.branchName || `Branch ${b.code || b.id}`,
      }));
      setBranches(mappedBranches);

      if (mappedBranches.length > 0) {
        const targetBId = selectedBranch === "all" ? mappedBranches[0].id : selectedBranch;
        const cRes = await cameraInventoryApi.listByBranch(targetBId, "device:configure");
        setCameras(cRes?.data || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedBranch]);

  const onlineCount = cameras.filter((c) => c.status === "online").length;
  const offlineCount = cameras.length - onlineCount;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
              <Link
                href="/admin"
                className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" /> Administration
              </Link>
              <span>/</span>
              <span className="text-gray-900 dark:text-white font-medium">Camera Ingestion & Export</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              Camera Details Import & Export (Excel / CSV)
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Import hundreds of cameras in seconds with custom IP addresses, credentials, RTSP paths, or export connected device inventory to Microsoft Excel spreadsheets.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/api/cameras/import/template"
              download="sentinel-camera-import-template.csv"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/50 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition"
            >
              <Download className="w-4 h-4" />
              Download Template
            </a>

            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/20 transition"
            >
              <Upload className="w-4 h-4" />
              Import / Export Cameras
            </button>
          </div>
        </div>

        {/* Quick Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Total Cameras
              <Camera className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {cameras.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Registered across branch</div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Online & Streaming
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {onlineCount}
            </div>
            <div className="text-xs text-emerald-600 dark:text-emerald-500">Live feeds active</div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Offline / Pending
              <Server className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
              {offlineCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Requires credential verification</div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Credential Security
              <ShieldCheck className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400">Vault 256</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Zero plaintext storage</div>
          </div>
        </div>

        {/* Action Banners & Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Batch Import */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-950 border border-blue-500/30 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Bulk Camera Import</h2>
                <p className="text-xs text-slate-400">Add dozens of cameras without network discovery</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              If your cameras are already deployed on specific static IPs with established passwords, you do not need to scan the network. Upload your Excel or CSV spreadsheet and Sentinel Grid will automatically configure all RTSP stream profiles, ONVIF ports, and encrypted vault references.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow transition"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Spreadsheet
              </button>

              <a
                href="/api/cameras/import/template"
                download="sentinel-camera-import-template.csv"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Sample Template (.csv)
              </a>
            </div>
          </div>

          {/* Card 2: Inventory Export */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Export Camera Inventory</h2>
                <p className="text-xs text-slate-400">Generate full Excel / CSV reports</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Export all connected and registered cameras across any branch into Microsoft Excel spreadsheets. Includes camera name, IP, RTSP stream URLs, resolutions, frame rates, PTZ/Audio capabilities, and last online timestamp.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="/api/cameras/export"
                download="sentinel-camera-inventory.csv"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export All Cameras (Excel)
              </a>

              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition"
              >
                <Layers className="w-3.5 h-3.5" />
                Custom Filter Export
              </button>
            </div>
          </div>
        </div>

        {/* Current Camera Table */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-500" />
              Current Camera Inventory
            </h2>

            <button
              onClick={loadData}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-3">Camera Name</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3">Vendor / Model</th>
                  <th className="p-3">Channel</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Main Stream RTSP</th>
                  <th className="p-3">Capabilities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {cameras.length > 0 ? (
                  cameras.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                      <td className="p-3 font-mono text-blue-600 dark:text-blue-400">{c.ipAddress}</td>
                      <td className="p-3 uppercase">
                        <span className="font-medium text-amber-600 dark:text-amber-400">{c.vendor}</span>{" "}
                        <span className="text-slate-400">({c.model || "IP Camera"})</span>
                      </td>
                      <td className="p-3 font-mono">{c.channel || 1}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            c.status === "online"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              c.status === "online" ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          {c.status || "online"}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-500 truncate max-w-xs">
                        {c.profiles?.[0]?.streamUri || `rtsp://admin:***@${c.ipAddress}:554/live`}
                      </td>
                      <td className="p-3 text-slate-500">
                        {c.capabilities?.ptz ? "PTZ " : ""}
                        {c.capabilities?.audio ? "Audio " : ""}
                        {c.capabilities?.motion ? "Motion" : ""}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No cameras found. Click "Import / Export Cameras" to upload an Excel or CSV file.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal */}
        <CameraImportExportModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          branches={branches}
          onImportSuccess={loadData}
        />
      </div>
    </AppLayout>
  );
}
