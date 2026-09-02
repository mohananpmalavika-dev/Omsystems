"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Camera,
  ShieldCheck,
  Server,
  Layers,
  HelpCircle,
  Lock,
} from "lucide-react";

interface CameraImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBranchId?: string;
  branches?: Array<{ id: string; name: string }>;
  onImportSuccess?: () => void;
}

interface ParsedCameraRow {
  rowNumber: number;
  name: string;
  ipAddress: string;
  username: string;
  password?: string;
  vendor?: string;
  model?: string;
  onvifPort?: number;
  rtspPort?: number;
  rtspPath?: string;
  subStreamPath?: string;
  channel?: number;
  branchId?: string;
  locationZone?: string;
  resolution?: string;
  fps?: number;
  ptz?: boolean;
  audio?: boolean;
  isValid: boolean;
  errors: string[];
}

export function CameraImportExportModal({
  isOpen,
  onClose,
  defaultBranchId = "branch-01",
  branches = [],
  onImportSuccess,
}: CameraImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<"import" | "export" | "specs">("import");
  const [selectedBranch, setSelectedBranch] = useState(defaultBranchId);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");

  // Parsed state
  const [parsedRows, setParsedRows] = useState<ParsedCameraRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [expandedSpecs, setExpandedSpecs] = useState(false);

  // Export options
  const [exportBranch, setExportBranch] = useState(defaultBranchId || "all");
  const [maskCredentials, setMaskCredentials] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Simple and robust CSV/TSV parser supporting quoted fields
  function parseDelimitedText(text: string): ParsedCameraRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return [];

    // Detect delimiter (comma or tab or semicolon)
    const firstLine = lines[0] || "";
    let delimiter = ",";
    if (firstLine.includes("\t")) delimiter = "\t";
    else if (firstLine.includes(";") && !firstLine.includes(",")) delimiter = ";";

    function splitRow(rowStr: string): string[] {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < rowStr.length; i++) {
        const char = rowStr[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ""));
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      return result;
    }

    const rawHeaders = splitRow(lines[0] || "").map((h) => h.toLowerCase().trim());
    const dataLines = lines.slice(1);

    // Map column aliases to canonical keys
    const headerMap: Record<string, number> = {};
    rawHeaders.forEach((h, index) => {
      if (h.includes("name") || h.includes("title")) headerMap.name = index;
      else if (h.includes("ip") || h.includes("host") || h.includes("address")) headerMap.ipAddress = index;
      else if (h.includes("user") || h.includes("login")) headerMap.username = index;
      else if (h.includes("pass") || h.includes("pwd")) headerMap.password = index;
      else if (h.includes("vendor") || h.includes("brand") || h.includes("manufactur")) headerMap.vendor = index;
      else if (h.includes("model")) headerMap.model = index;
      else if (h.includes("onvif")) headerMap.onvifPort = index;
      else if (h.includes("rtsp_port") || h === "port") headerMap.rtspPort = index;
      else if (h.includes("sub") && h.includes("path")) headerMap.subStreamPath = index;
      else if (h.includes("rtsp_path") || h.includes("path") || h.includes("stream")) headerMap.rtspPath = index;
      else if (h.includes("channel")) headerMap.channel = index;
      else if (h.includes("branch")) headerMap.branchId = index;
      else if (h.includes("zone") || h.includes("location") || h.includes("area")) headerMap.locationZone = index;
      else if (h.includes("resolution")) headerMap.resolution = index;
      else if (h.includes("fps") || h.includes("framerate")) headerMap.fps = index;
      else if (h.includes("ptz")) headerMap.ptz = index;
      else if (h.includes("audio")) headerMap.audio = index;
    });

    const parsed: ParsedCameraRow[] = [];

    dataLines.forEach((line, idx) => {
      const cols = splitRow(line);
      const rowNum = idx + 2;

      // Fallbacks if header mapping didn't find specific positions
      const name = (headerMap.name !== undefined ? cols[headerMap.name] : cols[0]) || "";
      const ipAddress = (headerMap.ipAddress !== undefined ? cols[headerMap.ipAddress] : cols[1]) || "";
      const username = (headerMap.username !== undefined ? cols[headerMap.username] : cols[2]) || "admin";
      const password = (headerMap.password !== undefined ? cols[headerMap.password] : cols[3]) || "";
      const vendor = (headerMap.vendor !== undefined ? cols[headerMap.vendor] : cols[4]) || "other";
      const model = (headerMap.model !== undefined ? cols[headerMap.model] : cols[5]) || "IP Camera";
      const onvifPortStr = (headerMap.onvifPort !== undefined ? cols[headerMap.onvifPort] : cols[6]) || "80";
      const rtspPortStr = (headerMap.rtspPort !== undefined ? cols[headerMap.rtspPort] : cols[7]) || "554";
      const rtspPath = (headerMap.rtspPath !== undefined ? cols[headerMap.rtspPath] : cols[8]) || "";
      const subStreamPath = (headerMap.subStreamPath !== undefined ? cols[headerMap.subStreamPath] : cols[9]) || "";
      const channelStr = (headerMap.channel !== undefined ? cols[headerMap.channel] : cols[10]) || "1";
      const branchId = (headerMap.branchId !== undefined ? cols[headerMap.branchId] : cols[11]) || selectedBranch;
      const locationZone = (headerMap.locationZone !== undefined ? cols[headerMap.locationZone] : cols[12]) || "Main";
      const resolution = (headerMap.resolution !== undefined ? cols[headerMap.resolution] : cols[13]) || "1920x1080";
      const fpsStr = (headerMap.fps !== undefined ? cols[headerMap.fps] : cols[14]) || "25";
      const ptzStr = (headerMap.ptz !== undefined ? cols[headerMap.ptz] : cols[15]) || "FALSE";
      const audioStr = (headerMap.audio !== undefined ? cols[headerMap.audio] : cols[16]) || "FALSE";

      const errors: string[] = [];
      if (!name) errors.push("Camera Name is required");
      if (!ipAddress) errors.push("IP Address is required");

      const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
      if (ipAddress && !ipRegex.test(ipAddress)) {
        errors.push(`Invalid IP/Hostname: ${ipAddress}`);
      }

      parsed.push({
        rowNumber: rowNum,
        name,
        ipAddress,
        username,
        password,
        vendor,
        model,
        onvifPort: parseInt(onvifPortStr, 10) || 80,
        rtspPort: parseInt(rtspPortStr, 10) || 554,
        rtspPath,
        subStreamPath,
        channel: parseInt(channelStr, 10) || 1,
        branchId,
        locationZone,
        resolution,
        fps: parseInt(fpsStr, 10) || 25,
        ptz: ptzStr.toLowerCase() === "true" || ptzStr === "1",
        audio: audioStr.toLowerCase() === "true" || audioStr === "1",
        isValid: errors.length === 0,
        errors,
      });
    });

    return parsed;
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseDelimitedText(content);
      setParsedRows(parsed);
      setIsParsing(false);
    };
    reader.onerror = () => {
      setIsParsing(false);
    };
    reader.readAsText(uploadedFile);
  };

  const handlePasteParse = () => {
    if (!rawText.trim()) return;
    setIsParsing(true);
    const parsed = parseDelimitedText(rawText);
    setParsedRows(parsed);
    setIsParsing(false);
  };

  const handleImportSubmit = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/cameras/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultBranchId: selectedBranch,
          cameras: validRows,
        }),
      });

      const data = await res.json();
      setImportResult(data);
      if (onImportSuccess) onImportSuccess();
    } catch (err: any) {
      setImportResult({
        success: false,
        imported: 0,
        failed: validRows.length,
        errors: [{ rowNumber: 0, error: err.message || "Failed to submit batch" }],
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportDownload = () => {
    setIsExporting(true);
    const query = new URLSearchParams();
    if (exportBranch && exportBranch !== "all") query.set("branchId", exportBranch);
    if (!maskCredentials) query.set("includeCredentials", "true");

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (token) query.set("token", token);

    const exportUrl = `/api/cameras/export?${query.toString()}`;
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = `sentinel-cameras-export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => setIsExporting(false), 1200);
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                Camera Import & Export Hub
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Excel / CSV Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Bulk add cameras with direct credentials or export connected device inventory
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => setActiveTab("import")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
              activeTab === "import"
                ? "border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="w-4 h-4" />
            Import Cameras (Excel/CSV)
          </button>

          <button
            onClick={() => setActiveTab("export")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
              activeTab === "export"
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Download className="w-4 h-4" />
            Export Inventory (.xlsx/.csv)
          </button>

          <button
            onClick={() => setActiveTab("specs")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
              activeTab === "specs"
                ? "border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Info className="w-4 h-4" />
            Field Specifications & Guide
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: IMPORT CAMERAS */}
          {activeTab === "import" && (
            <div className="space-y-6">
              {/* Branch Selector & Template Downloader */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-300">Target Branch:</span>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                  >
                    {branches.length > 0 ? (
                      branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.id})
                        </option>
                      ))
                    ) : (
                      <option value="branch-01">Main Branch (branch-01)</option>
                    )}
                  </select>
                </div>

                <a
                  href="/api/cameras/import/template"
                  download="sentinel-camera-import-template.csv"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium transition"
                >
                  <Download className="w-4 h-4" />
                  Download Excel CSV Template
                </a>
              </div>

              {/* Upload or Paste Toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInputMode("file")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    inputMode === "file"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Upload File (.csv / .xlsx / .tsv)
                </button>
                <button
                  onClick={() => setInputMode("paste")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    inputMode === "paste"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Paste Text / CSV Data
                </button>
              </div>

              {/* File Dropzone */}
              {inputMode === "file" ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const droppedFile = e.dataTransfer.files[0];
                    if (droppedFile) {
                      setFile(droppedFile);
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const content = evt.target?.result as string;
                        setParsedRows(parseDelimitedText(content));
                      };
                      reader.readAsText(droppedFile);
                    }
                  }}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition flex flex-col items-center justify-center gap-3 cursor-pointer ${
                    dragOver
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-700 hover:border-slate-600 bg-slate-900/40"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv,.txt,.tsv"
                    className="hidden"
                  />
                  <div className="p-3 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">
                      {file ? file.name : "Click to browse or drag & drop camera spreadsheet"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Supports CSV, Excel-exported CSV, TSV, or comma-delimited files
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={`camera_name,ip_address,username,password,vendor,model,rtsp_port\nFront Entrance Cam,192.168.1.101,admin,Pass@123,hikvision,DS-2CD2043G2,554\nCash Counter 1,192.168.1.102,admin,Pass@123,dahua,IPC-HDBW2431E,554`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handlePasteParse}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition"
                  >
                    Parse Pasted Text
                  </button>
                </div>
              )}

              {/* Parsed Rows Preview Table */}
              {parsedRows.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      Parsed Camera Records ({parsedRows.length} total)
                    </h3>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-4 h-4" /> {validCount} Valid
                      </span>
                      {invalidCount > 0 && (
                        <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                          <AlertTriangle className="w-4 h-4" /> {invalidCount} Errors
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950/60 max-h-72">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold">
                          <th className="p-3">#</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Camera Name</th>
                          <th className="p-3">IP Address</th>
                          <th className="p-3">Credentials</th>
                          <th className="p-3">Vendor / Model</th>
                          <th className="p-3">RTSP Port</th>
                          <th className="p-3">Location Zone</th>
                          <th className="p-3">Resolution / FPS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {parsedRows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={`hover:bg-slate-800/40 transition ${
                              !row.isValid ? "bg-rose-500/5" : ""
                            }`}
                          >
                            <td className="p-3 font-mono text-slate-500">{row.rowNumber}</td>
                            <td className="p-3">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">
                                  <CheckCircle2 className="w-3 h-3" /> Ready
                                </span>
                              ) : (
                                <span
                                  title={row.errors.join(", ")}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-medium"
                                >
                                  <AlertTriangle className="w-3 h-3" /> {row.errors[0]}
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-semibold text-white">{row.name || "—"}</td>
                            <td className="p-3 font-mono text-cyan-400">{row.ipAddress || "—"}</td>
                            <td className="p-3 font-mono text-slate-400">
                              {row.username}:{row.password ? "••••••" : "(blank)"}
                            </td>
                            <td className="p-3 uppercase">
                              <span className="text-amber-400 font-medium">{row.vendor}</span>{" "}
                              <span className="text-slate-500">({row.model})</span>
                            </td>
                            <td className="p-3 font-mono text-slate-300">{row.rtspPort}</td>
                            <td className="p-3 text-slate-400">{row.locationZone}</td>
                            <td className="p-3 text-slate-400">
                              {row.resolution} @ {row.fps}fps
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Submission Action */}
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-slate-400">
                      Auto-generating standard RTSP endpoints & provisioning encrypted vault credentials.
                    </p>

                    <button
                      onClick={handleImportSubmit}
                      disabled={isSubmitting || validCount === 0}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Importing & Connecting {validCount} Cameras...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          Import {validCount} Cameras to Sentinel Grid
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Import Results Banner */}
              {importResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    importResult.success
                      ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                      : "bg-rose-950/40 border-rose-500/40 text-rose-200"
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    {importResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                    )}
                    Import Completed: {importResult.imported} cameras added, {importResult.failed} failed.
                  </div>
                  {importResult.cameras?.length > 0 && (
                    <div className="mt-3 text-xs space-y-1 font-mono text-slate-300">
                      {importResult.cameras.slice(0, 5).map((c: any) => (
                        <div key={c.id} className="flex items-center gap-2">
                          <span className="text-emerald-400">✓</span> {c.name} ({c.ipAddress}) → {c.status}
                        </div>
                      ))}
                      {importResult.cameras.length > 5 && (
                        <div className="text-slate-500">...and {importResult.cameras.length - 5} more.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXPORT INVENTORY */}
          {activeTab === "export" && (
            <div className="space-y-6 max-w-2xl mx-auto py-4">
              <div className="text-center space-y-2">
                <div className="inline-flex p-4 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
                  <FileSpreadsheet className="w-10 h-10" />
                </div>
                <h3 className="text-lg font-bold text-white">Export Camera Inventory to Excel</h3>
                <p className="text-xs text-slate-400">
                  Generates an Excel-compatible spreadsheet (.csv with UTF-8 BOM) with full camera parameters, RTSP stream URLs, resolutions, status, and zone assignments.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Export Branch Scope:
                  </label>
                  <select
                    value={exportBranch}
                    onChange={(e) => setExportBranch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl p-3 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Branches (Global Inventory)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      Mask Passwords for Privacy
                    </div>
                    <div className="text-xs text-slate-400">
                      Replaces live credentials with *** in the export file for GDPR/SOC2 security compliance.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={maskCredentials}
                    onChange={(e) => setMaskCredentials(e.target.checked)}
                    className="w-5 h-5 rounded text-emerald-600 bg-slate-800 border-slate-700 focus:ring-0"
                  />
                </div>

                <button
                  onClick={handleExportDownload}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating Spreadsheet...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download Camera Inventory (.csv / Excel)
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: FIELD SPECIFICATIONS */}
          {activeTab === "specs" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Import Column Specifications</h3>
                  <p className="text-xs text-slate-400">
                    Below is the complete list of fields you can include in your Excel or CSV file.
                  </p>
                </div>
                <a
                  href="/api/cameras/import/template"
                  download="sentinel-camera-import-template.csv"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Sample Template
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Required Fields */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-blue-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-blue-400">
                    <ShieldCheck className="w-4 h-4" />
                    Required Columns
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-white">camera_name</div>
                      <div className="text-slate-400 mt-0.5">Unique friendly name for the camera.</div>
                      <div className="text-slate-500 font-mono mt-1">Example: "Front Entrance 4K"</div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-white">ip_address</div>
                      <div className="text-slate-400 mt-0.5">IPv4 address or hostname of camera/DVR.</div>
                      <div className="text-slate-500 font-mono mt-1">Example: "192.168.1.101"</div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-white">username</div>
                      <div className="text-slate-400 mt-0.5">Camera RTSP / ONVIF user (default: admin).</div>
                      <div className="text-slate-500 font-mono mt-1">Example: "admin"</div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-white">password</div>
                      <div className="text-slate-400 mt-0.5">Camera RTSP / ONVIF access password.</div>
                      <div className="text-slate-500 font-mono mt-1">Example: "Pass@123"</div>
                    </div>
                  </div>
                </div>

                {/* Optional Columns */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Optional Columns (Auto-Detected)
                  </div>

                  <div className="space-y-2 text-xs max-h-96 overflow-y-auto pr-1">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-amber-400">vendor / brand</div>
                      <div className="text-slate-400">hikvision, dahua, cpplus, uniview, axis, onvif</div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-amber-400">rtsp_port (Default: 554)</div>
                      <div className="text-slate-400">Port for RTSP media streaming.</div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-amber-400">onvif_port (Default: 80)</div>
                      <div className="text-slate-400">Port for ONVIF protocol communication.</div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-amber-400">rtsp_path & sub_stream_path</div>
                      <div className="text-slate-400">
                        Custom stream paths (auto-populated by brand if left blank).
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-amber-400">location_zone / area</div>
                      <div className="text-slate-400">e.g. "ATM Lobby", "Cash Counter 1", "Vault"</div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-amber-400">resolution & fps</div>
                      <div className="text-slate-400">e.g. "3840x2160" and 25 or 30 fps.</div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="font-mono font-bold text-amber-400">ptz & audio (TRUE / FALSE)</div>
                      <div className="text-slate-400">Enables pan-tilt-zoom motor and audio channels.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/80">
          <div className="text-xs text-slate-500">
            Sentinel Grid Camera Ingestion Engine v2.0
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
