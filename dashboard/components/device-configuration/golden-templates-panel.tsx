"use client";

import React, { useState, useEffect } from "react";
import {
  Shield,
  Layers,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  Eye,
  Plus,
  Server,
  Camera,
  Search,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lock,
  DollarSign,
  Building2,
  CreditCard,
  Radar,
  Sliders,
  RotateCcw,
  Clock,
  Network,
  Film,
  Zap,
} from "lucide-react";
import { deviceConfigurationApi } from "@/lib/api-client";

interface Template {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  targetType: "camera" | "recorder";
  classification: "branch_entrance" | "cash_counter" | "strongroom_vault" | "atm_vestibule" | "perimeter" | "universal";
  version: number;
  status: "draft" | "published" | "deprecated";
  settings: Record<string, any>;
  createdAt?: string;
}

interface ComplianceReport {
  tenantId: string;
  overallPercentage: number;
  totalDevicesEvaluated: number;
  compliantCount: number;
  driftedCount: number;
  unassignedCount: number;
  byClassification: Record<string, { total: number; compliant: number; percentage: number }>;
  drifts: Array<{
    deviceId: string;
    deviceName: string;
    templateId: string;
    templateName: string;
    classification: string;
    status: "compliant" | "drifted" | "unsupported";
    drifts: Array<{
      section: string;
      field: string;
      expectedValue: any;
      actualValue: any;
    }>;
    lastEvaluatedAt: string;
  }>;
  generatedAt: string;
}

const CLASSIFICATION_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string }
> = {
  branch_entrance: {
    label: "Branch Entrance",
    icon: Building2,
    color: "text-blue-400",
    bg: "bg-blue-950/40",
    border: "border-blue-800/60",
  },
  cash_counter: {
    label: "Cash Counter Teller",
    icon: DollarSign,
    color: "text-emerald-400",
    bg: "bg-emerald-950/40",
    border: "border-emerald-800/60",
  },
  strongroom_vault: {
    label: "Strongroom & Vault",
    icon: Lock,
    color: "text-amber-400",
    bg: "bg-amber-950/40",
    border: "border-amber-800/60",
  },
  atm_vestibule: {
    label: "ATM Vestibule",
    icon: CreditCard,
    color: "text-purple-400",
    bg: "bg-purple-950/40",
    border: "border-purple-800/60",
  },
  perimeter: {
    label: "Perimeter Surveillance",
    icon: Radar,
    color: "text-rose-400",
    bg: "bg-rose-950/40",
    border: "border-rose-800/60",
  },
  universal: {
    label: "Universal NVR Baseline",
    icon: Server,
    color: "text-cyan-400",
    bg: "bg-cyan-950/40",
    border: "border-cyan-800/60",
  },
};

export function GoldenTemplatesPanel({
  branches = [],
  selectedBranchId = "",
}: {
  branches?: Array<{ id: string; name: string; code?: string }>;
  selectedBranchId?: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [complianceReport, setComplianceReport] = useState<ComplianceReport | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [activeTab, setActiveTab] = useState<"templates" | "compliance">("templates");
  const [filterClassification, setFilterClassification] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal States
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [applyModalOpen, setApplyModalOpen] = useState(false);

  // Apply Modal State
  const [applyScope, setApplyScope] = useState<"single" | "branch" | "classification" | "fleet">("branch");
  const [applyBranchId, setApplyBranchId] = useState<string>(selectedBranchId || (branches[0]?.id ?? ""));
  const [applyDeviceId, setApplyDeviceId] = useState<string>("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<any | null>(null);

  // Remediation State
  const [remediating, setRemediating] = useState(false);
  const [remediationResult, setRemediationResult] = useState<any | null>(null);

  // Expanded Drifts in Table
  const [expandedDriftDeviceIds, setExpandedDriftDeviceIds] = useState<Set<string>>(new Set());

  // 1. Fetch Golden Templates
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await deviceConfigurationApi.listGoldenTemplates();
      if (res?.data) {
        setTemplates(res.data);
      }
    } catch (err) {
      console.error("Failed to load golden templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // 2. Fetch Fleet Compliance Report
  const loadCompliance = async () => {
    setLoadingCompliance(true);
    try {
      const res = await deviceConfigurationApi.getFleetCompliance();
      if (res?.data) {
        setComplianceReport(res.data);
      }
    } catch (err) {
      console.error("Failed to load fleet compliance:", err);
    } finally {
      setLoadingCompliance(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    loadCompliance();
  }, []);

  const handleOpenApplyModal = (template: Template) => {
    setSelectedTemplate(template);
    setApplyScope("branch");
    setApplyBranchId(selectedBranchId || (branches[0]?.id ?? ""));
    setApplyDeviceId("");
    setApplyResult(null);
    setApplyModalOpen(true);
  };

  const handleOpenViewDetails = (template: Template) => {
    setSelectedTemplate(template);
    setViewDetailsOpen(true);
  };

  const handleExecuteApply = async () => {
    if (!selectedTemplate) return;
    setApplying(true);
    setApplyResult(null);

    try {
      const payload: any = {
        scope: applyScope,
      };
      if (applyScope === "single") payload.deviceId = applyDeviceId;
      if (applyScope === "branch") payload.branchId = applyBranchId;
      if (applyScope === "classification") payload.classification = selectedTemplate.classification;

      const res = await deviceConfigurationApi.applyGoldenTemplate(selectedTemplate.id, payload);
      setApplyResult(res?.data || { success: true, message: "Template applied" });
      // Reload compliance report automatically
      loadCompliance();
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err.message || "Failed to apply template",
      });
    } finally {
      setApplying(false);
    }
  };

  const handleRemediateAll = async (templateId: string) => {
    setRemediating(true);
    setRemediationResult(null);
    try {
      const res = await deviceConfigurationApi.remediateCompliance({ templateId });
      setRemediationResult(res?.data);
      loadCompliance();
    } catch (err: any) {
      console.error("Remediation error:", err);
    } finally {
      setRemediating(false);
    }
  };

  const handleRemediateSingleDevice = async (templateId: string, deviceId: string) => {
    try {
      await deviceConfigurationApi.remediateCompliance({
        templateId,
        deviceIds: [deviceId],
      });
      loadCompliance();
    } catch (err) {
      console.error("Single device remediation error:", err);
    }
  };

  const toggleDriftExpanded = (deviceId: string) => {
    setExpandedDriftDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const filteredTemplates = templates.filter((t) => {
    if (filterClassification !== "all" && t.classification !== filterClassification) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        t.classification.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Navigation */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              Phase 9 Standard
            </span>
            <span className="text-slate-400 text-xs font-mono">Control Plane Orchestration</span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Golden Configuration Templates & Fleet Compliance
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Declarative hardware baseline templates with variable substitution, staged rollout across branches and classifications, and 1-click automated configuration drift remediation.
          </p>
        </div>

        {/* Action Controls & Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("templates")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "templates"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Templates Catalog ({templates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("compliance")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "compliance"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Fleet Compliance
            {complianceReport && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  complianceReport.overallPercentage >= 90
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                {complianceReport.overallPercentage}%
              </span>
            )}
          </button>
        </div>
      </div>

      {/* COMPLIANCE OVERVIEW CARDS */}
      {complianceReport && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 1. Overall Compliance Score */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg border ${
                complianceReport.overallPercentage >= 90
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/80"
                  : complianceReport.overallPercentage >= 70
                  ? "bg-amber-950/60 text-amber-400 border-amber-800/80"
                  : "bg-rose-950/60 text-rose-400 border-rose-800/80"
              }`}
            >
              {complianceReport.overallPercentage}%
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Fleet Compliance Rate</div>
              <div className="text-lg font-bold text-white mt-0.5">
                {complianceReport.compliantCount} / {complianceReport.totalDevicesEvaluated}
              </div>
              <div className="text-[11px] text-slate-500">Hardware verified compliant</div>
            </div>
          </div>

          {/* 2. Drifted Devices */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Configuration Drifts</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                {complianceReport.driftedCount}
              </div>
              <div className="text-[11px] text-slate-500">Mismatches against baseline</div>
            </div>
            {complianceReport.driftedCount > 0 && (
              <button
                type="button"
                onClick={() => handleRemediateAll(templates[0]?.id || "tmpl-preset-branch-entrance")}
                disabled={remediating}
                className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-md shadow-amber-600/20"
              >
                <Zap className={`w-3.5 h-3.5 ${remediating ? "animate-spin" : ""}`} />
                {remediating ? "Remediating..." : "Fix All"}
              </button>
            )}
          </div>

          {/* 3. System Presets Active */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-950/60 text-indigo-400 border border-indigo-800/60">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Banking Standards</div>
              <div className="text-xl font-bold text-white mt-0.5">6 Presets</div>
              <div className="text-[11px] text-slate-500">FHD, WDR, NTP, 24/7 Record</div>
            </div>
          </div>

          {/* 4. Last Audit Refresh */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Audit Telemetry</div>
              <div className="text-xs font-mono text-slate-300 mt-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {new Date(complianceReport.generatedAt).toLocaleTimeString()}
              </div>
              <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Live Read-After-Write
              </div>
            </div>
            <button
              type="button"
              onClick={loadCompliance}
              disabled={loadingCompliance}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Run Compliance Scan"
            >
              <RefreshCw className={`w-4 h-4 ${loadingCompliance ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: GOLDEN TEMPLATES CATALOG */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 mr-1">Classification:</span>
              <button
                type="button"
                onClick={() => setFilterClassification("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filterClassification === "all"
                    ? "bg-slate-200 text-slate-900 font-bold"
                    : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                All Standards
              </button>
              {Object.entries(CLASSIFICATION_CONFIG).map(([key, cfg]) => {
                const isSelected = filterClassification === key;
                const Icon = cfg.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterClassification(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                      isSelected
                        ? `${cfg.bg} ${cfg.color} ${cfg.border} border font-bold shadow-sm`
                        : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search templates or parameters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Template Grid */}
          {loadingTemplates ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
              Loading Golden Configuration Templates...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
              No templates match your search filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTemplates.map((template) => {
                const classCfg = CLASSIFICATION_CONFIG[template.classification] || CLASSIFICATION_CONFIG.universal;
                const Icon = classCfg.icon;
                const isPreset = template.tenantId === "system";

                const video = template.settings?.videoConfig;
                const image = template.settings?.imageConfig;
                const time = template.settings?.timeConfig;
                const schedule = template.settings?.recordingSchedule;

                return (
                  <div
                    key={template.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl transition flex flex-col justify-between group"
                  >
                    <div>
                      {/* Header Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${classCfg.bg} ${classCfg.color} ${classCfg.border} border`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {classCfg.label}
                        </span>

                        {isPreset ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Banking Preset
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            Custom v{template.version}
                          </span>
                        )}
                      </div>

                      {/* Template Title & Description */}
                      <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition mb-1">
                        {template.name}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                        {template.description || "Standardized golden template parameters."}
                      </p>

                      {/* Key Parameter Badges */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {video?.resolution && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 text-[10px] font-mono border border-slate-800">
                            {video.resolution.width}x{video.resolution.height} @ {video.frameRate}fps
                          </span>
                        )}
                        {video?.codec && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 text-[10px] font-mono border border-slate-800">
                            {video.codec} ({video.bitrateKbps} kbps)
                          </span>
                        )}
                        {image?.wideDynamicRange && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 text-[10px] font-mono border border-slate-800">
                            WDR {image.wideDynamicRange.mode} {image.wideDynamicRange.level ? `(${image.wideDynamicRange.level}%)` : ""}
                          </span>
                        )}
                        {time?.ntpServer && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-indigo-300 text-[10px] font-mono border border-slate-800 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> NTP Sync
                          </span>
                        )}
                        {schedule?.mode && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-emerald-300 text-[10px] font-mono border border-slate-800 flex items-center gap-1">
                            <Film className="w-2.5 h-2.5" /> 24/7 {schedule.mode}
                          </span>
                        )}
                      </div>

                      {/* Variable Substitution Hints */}
                      <div className="text-[10px] text-slate-500 font-mono bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 mb-4">
                        Variables: <span className="text-indigo-400">{"{{branch-gateway}}"}</span>, <span className="text-indigo-400">{"{{branch-ntp}}"}</span>, <span className="text-indigo-400">{"{{assigned}}"}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => handleOpenViewDetails(template)}
                        className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Settings
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenApplyModal(template)}
                        className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-md shadow-indigo-600/20"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Apply
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FLEET COMPLIANCE AUDIT & DRIFT TABLE */}
      {activeTab === "compliance" && (
        <div className="space-y-6">
          {/* Classification Breakdown Progress Rows */}
          {complianceReport?.byClassification && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                Compliance Breakdown by Security Classification
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(complianceReport.byClassification).map(([key, stats]) => {
                  const cfg = CLASSIFICATION_CONFIG[key] || CLASSIFICATION_CONFIG.universal;
                  const Icon = cfg.icon;
                  return (
                    <div key={key} className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${cfg.color}`} />
                          <span className="text-xs font-bold text-white">{cfg.label}</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-300">
                          {stats.percentage}%
                        </span>
                      </div>

                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            stats.percentage >= 90
                              ? "bg-emerald-500"
                              : stats.percentage >= 70
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${stats.percentage}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Compliant: {stats.compliant}</span>
                        <span>Total: {stats.total}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detailed Devices Drift Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  Hardware Devices Audit & Drift Telemetry
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Physical configuration read directly from device firmware compared against baseline template.
                </p>
              </div>

              <button
                type="button"
                onClick={loadCompliance}
                disabled={loadingCompliance}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingCompliance ? "animate-spin" : ""}`} />
                Re-scan Fleet
              </button>
            </div>

            {loadingCompliance ? (
              <div className="py-20 text-center text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                Evaluating hardware parameters across fleet...
              </div>
            ) : !complianceReport || complianceReport.drifts.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs">
                No active devices found to evaluate compliance.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {complianceReport.drifts.map((deviceDrift) => {
                  const isExpanded = expandedDriftDeviceIds.has(deviceDrift.deviceId);
                  const isCompliant = deviceDrift.status === "compliant";
                  const classCfg = CLASSIFICATION_CONFIG[deviceDrift.classification] || CLASSIFICATION_CONFIG.universal;
                  const Icon = classCfg.icon;

                  return (
                    <div key={deviceDrift.deviceId} className="p-4 hover:bg-slate-900/50 transition">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => toggleDriftExpanded(deviceDrift.deviceId)}
                            className="p-1 rounded text-slate-400 hover:text-white"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center ${classCfg.bg} ${classCfg.color} border ${classCfg.border}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>

                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-2">
                              {deviceDrift.deviceName}
                              <span className="text-slate-500 font-mono text-[10px] font-normal">
                                ({deviceDrift.deviceId})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                              <span>Standard: {deviceDrift.templateName}</span>
                              <span>•</span>
                              <span>{classCfg.label}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status & Quick Action */}
                        <div className="flex items-center gap-3">
                          {isCompliant ? (
                            <span className="px-3 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 text-xs font-bold flex items-center gap-1.5">
                              <CheckCircle className="w-3.5 h-3.5" /> 100% Compliant
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800/80 text-xs font-bold flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {deviceDrift.drifts.length} {deviceDrift.drifts.length === 1 ? "Drift" : "Drifts"}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleRemediateSingleDevice(deviceDrift.templateId, deviceDrift.deviceId)}
                                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1 transition shadow-sm"
                              >
                                <Zap className="w-3 h-3" />
                                Remediate
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded Drift Details Table */}
                      {isExpanded && (
                        <div className="mt-4 ml-12 bg-slate-950 rounded-xl p-4 border border-slate-800/80">
                          {deviceDrift.drifts.length === 0 ? (
                            <div className="text-xs text-emerald-400 flex items-center gap-2">
                              <Check className="w-4 h-4" />
                              All video, imaging, time synchronization, and network parameters match the golden baseline.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-xs font-bold text-slate-300 mb-2">Detected Configuration Drifts:</div>
                              <div className="grid grid-cols-12 text-[11px] font-semibold text-slate-500 pb-1 border-b border-slate-800">
                                <span className="col-span-3">Parameter</span>
                                <span className="col-span-4">Expected (Golden Template)</span>
                                <span className="col-span-5">Actual (Device Hardware)</span>
                              </div>
                              {deviceDrift.drifts.map((d, i) => (
                                <div key={i} className="grid grid-cols-12 text-xs py-1.5 border-b border-slate-900 items-center font-mono">
                                  <span className="col-span-3 text-slate-300 font-sans font-medium capitalize">
                                    {d.section}.{d.field}
                                  </span>
                                  <span className="col-span-4 text-emerald-400">
                                    {String(d.expectedValue)}
                                  </span>
                                  <span className="col-span-5 text-amber-400">
                                    {String(d.actualValue)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAGED ROLLOUT / APPLY MODAL */}
      {applyModalOpen && selectedTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                  Staged Rollout Orchestration
                </span>
                <h3 className="text-lg font-bold text-white mt-1">
                  Apply Golden Template
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedTemplate.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setApplyModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Scope Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 block">
                Target Deployment Scope:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "single", label: "Single Device", desc: "Target 1 specific camera or NVR" },
                  { id: "branch", label: "Entire Branch", desc: "All devices at selected branch" },
                  { id: "classification", label: "Security Classification", desc: `All ${selectedTemplate.classification} devices` },
                  { id: "fleet", label: "Entire Fleet", desc: "All cameras across all branches" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setApplyScope(s.id as any)}
                    className={`p-3 rounded-xl border text-left transition ${
                      applyScope === s.id
                        ? "bg-indigo-950/60 border-indigo-600 text-white"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div className="text-xs font-bold">{s.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Scope Parameters */}
            {applyScope === "single" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Device ID or IP:</label>
                <input
                  type="text"
                  placeholder="e.g. cam-entrance-01 or 192.168.1.10"
                  value={applyDeviceId}
                  onChange={(e) => setApplyDeviceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {applyScope === "branch" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Select Target Branch:</label>
                <select
                  value={applyBranchId}
                  onChange={(e) => setApplyBranchId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code || b.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Variable Substitution Assurance */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Automated Variable Substitution Active:
              </div>
              <p className="text-[11px] text-slate-400">
                Network gateways, NTP timeservers, and IP addresses will be dynamically populated per-device from branch inventory metadata:
              </p>
              <div className="flex flex-wrap gap-1 text-[10px] font-mono text-slate-400">
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400">{"{{branch-gateway}}"}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400">{"{{branch-subnet}}"}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400">{"{{branch-ntp}}"}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400">{"{{assigned}}"}</span>
              </div>
            </div>

            {/* Execution Result Banner */}
            {applyResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs ${
                  applyResult.success !== false
                    ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                    : "bg-rose-950/60 border-rose-800/80 text-rose-300"
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {applyResult.success !== false ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                  {applyResult.success !== false ? "Rollout Execution Completed" : "Rollout Failed"}
                </div>
                <div className="mt-1 text-[11px]">
                  {applyResult.appliedCount !== undefined
                    ? `Successfully applied and hardware-verified on ${applyResult.appliedCount} / ${applyResult.totalTargeted} devices.`
                    : applyResult.message || applyResult.error}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setApplyModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExecuteApply}
                disabled={applying}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-600/30"
              >
                <Play className={`w-3.5 h-3.5 fill-current ${applying ? "animate-spin" : ""}`} />
                {applying ? "Orchestrating Hardware..." : "Apply Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {viewDetailsOpen && selectedTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {selectedTemplate.name}
                </h3>
                <span className="text-xs text-slate-400 capitalize">
                  {selectedTemplate.classification.replace("_", " ")} Standard
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewDetailsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto max-h-[400px]">
                <pre className="text-indigo-300 text-[11px]">
                  {JSON.stringify(selectedTemplate.settings, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setViewDetailsOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
