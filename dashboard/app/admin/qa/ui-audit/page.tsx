"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import {
  Play,
  Pause,
  XCircle,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Video,
  Layers,
  ArrowRight,
  Terminal,
  Activity,
  BarChart2,
  Clock,
  Laptop,
  Smartphone,
  Eye,
  EyeOff,
} from "lucide-react";
import type { QARunProgressEvent } from "../../../../../qa-engine/src/types/qa.types";

export default function AutomatedUiAuditPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"new" | "live" | "history">("new");

  // Audit Form State
  const [targetUrl, setTargetUrl] = useState("https://3-7-216-169.sslip.io/");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [userRole, setUserRole] = useState("Admin");
  const [browser, setBrowser] = useState("chromium");
  const [deviceProfile, setDeviceProfile] = useState("Desktop 1920x1080");
  const [startingPath, setStartingPath] = useState("/");
  const [maxPages, setMaxPages] = useState(250);
  const [maxDepth, setMaxDepth] = useState(10);
  const [pageTimeoutSec, setPageTimeoutSec] = useState(30);

  // Checkbox features
  const [features, setFeatures] = useState({
    autoDiscover: true,
    recordVideo: true,
    captureScreenshots: true,
    captureTrace: true,
    captureConsole: true,
    captureNetwork: true,
    testLinks: true,
    testTabs: true,
    testDialogs: true,
    testFormsSafe: true,
    detectBlankPages: true,
    detectDuplicates: true,
    detectAccessibility: true,
    testResponsive: true,
  });

  // Advanced Options Drawer
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState("");
  const [blockedPaths, setBlockedPaths] = useState("");
  const [ignoreSelectors, setIgnoreSelectors] = useState("");
  const [allowedDestructive, setAllowedDestructive] = useState("");
  const [usernameSelector, setUsernameSelector] = useState("");
  const [passwordSelector, setPasswordSelector] = useState("");
  const [submitSelector, setSubmitSelector] = useState("");
  const [crawlDelayMs, setCrawlDelayMs] = useState(150);
  const [maxActions, setMaxActions] = useState(1000);
  const [authTimeoutSec, setAuthTimeoutSec] = useState(15);
  const [screenshotMode, setScreenshotMode] = useState<"all" | "errors_only" | "key_milestones">("all");
  const [videoResolution, setVideoResolution] = useState<"1280x720" | "1920x1080" | "800x600">("1920x1080");
  const [retentionDays, setRetentionDays] = useState(30);
  const [testEnvironmentTag, setTestEnvironmentTag] = useState<"DEV" | "TEST" | "STAGING" | "DEMO" | "PRODUCTION">("DEMO");

  // Running state
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [liveEvent, setLiveEvent] = useState<QARunProgressEvent | null>(null);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  // Run History
  const [runs, setRuns] = useState<any[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // Compare selection
  const [compareRuns, setCompareRuns] = useState<string[]>([]);

  // Load history on mount
  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    setLoadingRuns(true);
    try {
      const res = await fetch("/api/admin/qa/runs");
      const data = await res.json();
      if (data.success && Array.isArray(data.runs)) {
        setRuns(data.runs);
      }
    } catch (err) {
      console.error("Failed to fetch QA runs:", err);
    } finally {
      setLoadingRuns(false);
    }
  };

  // Launch Audit
  const handleRunAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);
    setLiveLogs(["[QA Crawler] Submitting audit configuration..."]);

    const payload = {
      targetUrl,
      username: username.trim() || undefined,
      password: password || undefined,
      userRole,
      browser,
      deviceProfile,
      startingPath,
      maxPages,
      maxDepth,
      pageTimeoutSec,
      options: {
        ...features,
        allowedDomains: allowedDomains ? allowedDomains.split(",").map((s) => s.trim()) : undefined,
        blockedPaths: blockedPaths ? blockedPaths.split(",").map((s) => s.trim()) : undefined,
        ignoreSelectors: ignoreSelectors ? ignoreSelectors.split(",").map((s) => s.trim()) : undefined,
        allowedDestructive: allowedDestructive ? allowedDestructive.split(",").map((s) => s.trim()) : undefined,
        loginSelectorsOverride:
          usernameSelector || passwordSelector || submitSelector
            ? {
                usernameSelector: usernameSelector || undefined,
                passwordSelector: passwordSelector || undefined,
                submitSelector: submitSelector || undefined,
              }
            : undefined,
        crawlDelayMs,
        maxActions,
        authTimeoutSec,
        screenshotMode,
        videoResolution,
        retentionDays,
        testEnvironmentTag,
      },
    };

    try {
      const res = await fetch("/api/admin/qa/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to start run");
      }

      setActiveRunId(data.runId);
      setActiveTab("live");
      subscribeToLiveProgress(data.runId);
    } catch (err: any) {
      alert(`Error starting audit: ${err.message}`);
      setIsRunning(false);
    }
  };

  // Live SSE stream connection
  const subscribeToLiveProgress = (runId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    const sse = new EventSource(`/api/admin/qa/runs/${runId}/live`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "connected") {
          setLiveLogs((prev) => [...prev, `[Connected] ${parsed.message}`]);
          return;
        }

        const progress = parsed as QARunProgressEvent;
        setLiveEvent(progress);

        if (progress.message) {
          setLiveLogs((prev) => [...prev.slice(-100), `[${progress.status}] ${progress.message}`]);
        }

        if (progress.status === "COMPLETED" || progress.status === "FAILED" || progress.status === "CANCELLED") {
          setIsRunning(false);
          sse.close();
          fetchRuns();
        }
      } catch (err) {
        console.warn("SSE parse error:", err);
      }
    };

    sse.onerror = () => {
      console.warn("SSE connection error; fallback polling");
    };
  };

  // Run lifecycle actions
  const triggerAction = async (action: "pause" | "resume" | "cancel") => {
    if (!activeRunId) return;
    try {
      await fetch(`/api/admin/qa/runs/${activeRunId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (action === "pause") setIsPaused(true);
      if (action === "resume") setIsPaused(false);
      if (action === "cancel") {
        setIsRunning(false);
        if (sseRef.current) sseRef.current.close();
      }
    } catch (err) {
      console.error(`Failed to ${action} run:`, err);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* Header Banner */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-950 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-400 border border-blue-800">
                Quality Assurance
              </span>
              <span className="rounded-md bg-purple-950 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-purple-400 border border-purple-800">
                Playwright Engine
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Sparkles className="h-6 w-6 text-blue-400" />
              Automated User Flow Recorder & QA Crawler
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Autonomous browser crawling, user-flow graph discovery, video session recording, accessibility auditing, and API failure intelligence.
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800">
            <button
              onClick={() => setActiveTab("new")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                activeTab === "new" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              New Audit
            </button>
            <button
              onClick={() => setActiveTab("live")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === "live" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              {isRunning && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
              Live Progress
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                activeTab === "history" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Run History ({runs.length})
            </button>
          </div>
        </div>

        {/* TAB 1: NEW AUDIT FORM */}
        {activeTab === "new" && (
          <form onSubmit={handleRunAudit} className="space-y-6">
            {/* Production Warning Banner if PRODUCTION environment */}
            {testEnvironmentTag === "PRODUCTION" && (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-950/40 p-4 text-red-200">
                <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong className="font-semibold block text-red-100">PRODUCTION ENVIRONMENT SAFEGUARD ACTIVE</strong>
                  Safe navigation mode will be strictly enforced. All mutating forms, data creation, and destructive buttons are blocked by default to prevent data corruption.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Primary Settings */}
              <div className="lg:col-span-2 space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-base font-semibold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-blue-400" />
                  Target & Credentials
                </h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-300">Target Application URL *</label>
                    <input
                      type="url"
                      required
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      placeholder="https://demo.kryptonlogic.com"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Username / Email</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin@kryptonlogic.com"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Password</label>
                    <div className="relative mt-1.5">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 pr-10 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">User Role</label>
                    <select
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="Super Admin">Super Admin</option>
                      <option value="Admin">Admin</option>
                      <option value="Operator">Operator</option>
                      <option value="Investigator">Investigator</option>
                      <option value="Auditor">Auditor</option>
                      <option value="Branch User">Branch User</option>
                      <option value="Technician">Technician</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Starting Path</label>
                    <input
                      type="text"
                      value={startingPath}
                      onChange={(e) => setStartingPath(e.target.value)}
                      placeholder="/"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">Browser</label>
                    <select
                      value={browser}
                      onChange={(e) => setBrowser(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="chromium">Chromium (Recommended)</option>
                      <option value="firefox">Firefox</option>
                      <option value="webkit">WebKit (Safari)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Device Profile</label>
                    <select
                      value={deviceProfile}
                      onChange={(e) => setDeviceProfile(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="Desktop 1920x1080">Desktop 1920x1080</option>
                      <option value="Desktop 1440x900">Desktop 1440x900</option>
                      <option value="Desktop 1366x768">Desktop 1366x768</option>
                      <option value="Tablet 1024x768">Tablet 1024x768</option>
                      <option value="Tablet 768x1024">Tablet 768x1024</option>
                      <option value="Mobile 390x844">Mobile iPhone 390x844</option>
                      <option value="Mobile 360x800">Mobile Android 360x800</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Environment Tag</label>
                    <select
                      value={testEnvironmentTag}
                      onChange={(e) => setTestEnvironmentTag(e.target.value as any)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="DEMO">DEMO</option>
                      <option value="DEV">DEV</option>
                      <option value="TEST">TEST</option>
                      <option value="STAGING">STAGING</option>
                      <option value="PRODUCTION">PRODUCTION</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">Max Pages</label>
                    <input
                      type="number"
                      min={5}
                      max={1000}
                      value={maxPages}
                      onChange={(e) => setMaxPages(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Max Crawl Depth</label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={maxDepth}
                      onChange={(e) => setMaxDepth(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Timeout Per Page (sec)</label>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={pageTimeoutSec}
                      onChange={(e) => setPageTimeoutSec(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Inspection Features Checklist */}
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-base font-semibold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  Audit Inspection Matrix
                </h2>

                <div className="space-y-2.5 pt-1 text-xs text-slate-300">
                  {Object.entries({
                    autoDiscover: "Auto-discover pages",
                    recordVideo: "Record session video (.webm)",
                    captureScreenshots: "Capture milestone screenshots",
                    captureTrace: "Capture Playwright trace archive",
                    captureConsole: "Capture console errors & warnings",
                    captureNetwork: "Capture failed API/network calls",
                    testLinks: "Test internal navigation links",
                    testTabs: "Test tab panels safely",
                    testDialogs: "Test modal open/dismiss & Escape",
                    testFormsSafe: "Probe search & filter forms",
                    detectBlankPages: "Detect blank & white-screen crashes",
                    detectDuplicates: "Detect duplicate pages & loops",
                    detectAccessibility: "Audit WCAG accessibility (axe)",
                    testResponsive: "Verify responsive layout boundaries",
                  }).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={(features as any)[key]}
                        onChange={(e) => setFeatures({ ...features, [key]: e.target.checked })}
                        className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <button
                    type="submit"
                    disabled={isRunning}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-500 transition disabled:opacity-50"
                  >
                    <Play className="h-4 w-4 fill-white" />
                    RUN AUDIT
                  </button>
                </div>
              </div>
            </div>

            {/* Advanced Options Accordion */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between text-sm font-semibold text-slate-300 hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-400" />
                  Advanced Crawl & Safety Parameters
                </span>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showAdvanced && (
                <div className="mt-4 grid grid-cols-1 gap-4 pt-3 border-t border-slate-800 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block font-medium text-slate-300">Allowed Domains (comma-separated)</label>
                    <input
                      type="text"
                      value={allowedDomains}
                      onChange={(e) => setAllowedDomains(e.target.value)}
                      placeholder="demo.kryptonlogic.com, sslip.io"
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300">Blocked Paths (comma-separated)</label>
                    <input
                      type="text"
                      value={blockedPaths}
                      onChange={(e) => setBlockedPaths(e.target.value)}
                      placeholder="/logout, /admin/billing"
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300">Allowed Destructive Actions (Whitelisted)</label>
                    <input
                      type="text"
                      value={allowedDestructive}
                      onChange={(e) => setAllowedDestructive(e.target.value)}
                      placeholder="delete test camera"
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300">Username Selector Override</label>
                    <input
                      type="text"
                      value={usernameSelector}
                      onChange={(e) => setUsernameSelector(e.target.value)}
                      placeholder="#email or input[name='username']"
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300">Password Selector Override</label>
                    <input
                      type="text"
                      value={passwordSelector}
                      onChange={(e) => setPasswordSelector(e.target.value)}
                      placeholder="#password"
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300">Submit Button Selector Override</label>
                    <input
                      type="text"
                      value={submitSelector}
                      onChange={(e) => setSubmitSelector(e.target.value)}
                      placeholder="button[type='submit']"
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300">Crawl Delay (ms)</label>
                    <input
                      type="number"
                      value={crawlDelayMs}
                      onChange={(e) => setCrawlDelayMs(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300">Max Actions Cap</label>
                    <input
                      type="number"
                      value={maxActions}
                      onChange={(e) => setMaxActions(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300">Video Resolution</label>
                    <select
                      value={videoResolution}
                      onChange={(e) => setVideoResolution(e.target.value as any)}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                    >
                      <option value="1920x1080">1920x1080 (FHD)</option>
                      <option value="1280x720">1280x720 (HD)</option>
                      <option value="800x600">800x600 (Compact)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </form>
        )}

        {/* TAB 2: LIVE PROGRESS VIEW */}
        {activeTab === "live" && (
          <div className="space-y-6">
            {!activeRunId ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
                <Clock className="mx-auto h-12 w-12 text-slate-600 mb-3" />
                <h3 className="text-lg font-semibold text-white">No Active Audit In Progress</h3>
                <p className="mt-1 text-sm text-slate-400">Configure parameters in the New Audit tab and launch a run.</p>
                <button
                  onClick={() => setActiveTab("new")}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Configure New Audit
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Status Bar */}
                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-5">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Active Run</span>
                      <span className="font-mono text-xs text-slate-400">{activeRunId}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          liveEvent?.status === "COMPLETED"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : liveEvent?.status === "FAILED"
                            ? "bg-red-950 text-red-400 border border-red-800"
                            : "bg-blue-950 text-blue-400 border border-blue-800 animate-pulse"
                        }`}
                      >
                        {liveEvent?.status || "INITIALIZING"}
                      </span>
                    </div>
                    <p className="mt-1 text-base font-bold text-white">
                      {liveEvent?.message || "Preparing Playwright crawler engine..."}
                    </p>
                    {liveEvent?.currentPage && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Current Page: <span className="text-blue-300 font-mono">{liveEvent.currentPage}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isRunning && !isPaused && (
                      <button
                        onClick={() => triggerAction("pause")}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/40"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </button>
                    )}
                    {isRunning && isPaused && (
                      <button
                        onClick={() => triggerAction("resume")}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Resume
                      </button>
                    )}
                    {isRunning && (
                      <button
                        onClick={() => triggerAction("cancel")}
                        className="flex items-center gap-1.5 rounded-lg border border-red-600/40 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/40"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel Run
                      </button>
                    )}
                    {liveEvent?.status === "COMPLETED" && (
                      <Link
                        href={`/admin/qa/ui-audit/${activeRunId}`}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                      >
                        View Full Report
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Progress KPI Cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-xs text-slate-400">Pages Tested</div>
                    <div className="mt-1 text-2xl font-bold text-white">
                      {liveEvent?.pagesTested || 0}{" "}
                      <span className="text-sm font-normal text-slate-500">/ {liveEvent?.pagesDiscovered || 0}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-xs text-slate-400">Actions Tested</div>
                    <div className="mt-1 text-2xl font-bold text-white">{liveEvent?.actionsExecuted || 0}</div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-xs text-slate-400">Critical Issues</div>
                    <div className="mt-1 text-2xl font-bold text-red-400">
                      {liveEvent?.issuesCount?.critical || 0}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-xs text-slate-400">Major / Minor</div>
                    <div className="mt-1 text-2xl font-bold text-amber-400">
                      {liveEvent?.issuesCount?.major || 0}{" "}
                      <span className="text-sm font-normal text-slate-500">/ {liveEvent?.issuesCount?.minor || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Live Console Output */}
                <div className="rounded-xl border border-slate-800 bg-black/90 p-4 font-mono text-xs text-slate-300">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <span className="text-slate-400 flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-blue-400" />
                      Live Crawler Execution Feed
                    </span>
                    <span className="text-[11px] text-slate-500">{liveLogs.length} events</span>
                  </div>
                  <div className="h-64 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                    {liveLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className={
                          log.includes("CRITICAL") || log.includes("FAILED")
                            ? "text-red-400"
                            : log.includes("Visited")
                            ? "text-emerald-400"
                            : log.includes("Testing")
                            ? "text-blue-300"
                            : "text-slate-400"
                        }
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: RUN HISTORY TABLE */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                All historical Playwright QA audits. Select two runs to perform regression comparisons.
              </p>
              {compareRuns.length === 2 && (
                <Link
                  href={`/admin/qa/ui-audit/compare?base=${compareRuns[0]}&target=${compareRuns[1]}`}
                  className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500"
                >
                  Compare Selected ({compareRuns[0]} vs {compareRuns[1]})
                </Link>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="p-3.5 w-8"></th>
                    <th className="p-3.5">Run ID</th>
                    <th className="p-3.5">Target</th>
                    <th className="p-3.5">Role / Device</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">QA Score</th>
                    <th className="p-3.5">Coverage</th>
                    <th className="p-3.5">Issues</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {runs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500">
                        {loadingRuns ? "Loading historical runs..." : "No QA audit runs recorded yet."}
                      </td>
                    </tr>
                  ) : (
                    runs.map((run) => {
                      const score = run.overall_score;
                      const scoreColor =
                        score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
                      const isChecked = compareRuns.includes(run.id);

                      return (
                        <tr key={run.id} className="hover:bg-slate-800/30 transition">
                          <td className="p-3.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (compareRuns.length < 2) setCompareRuns([...compareRuns, run.id]);
                                } else {
                                  setCompareRuns(compareRuns.filter((id) => id !== run.id));
                                }
                              }}
                              className="rounded border-slate-700 bg-slate-950 text-purple-600"
                            />
                          </td>
                          <td className="p-3.5 font-mono font-medium text-white">{run.id}</td>
                          <td className="p-3.5 font-medium text-blue-300 max-w-[200px] truncate">{run.target_url}</td>
                          <td className="p-3.5 text-slate-400">
                            {run.user_role} • {run.browser}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                run.status === "COMPLETED"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                  : run.status === "FAILED"
                                  ? "bg-red-950 text-red-400 border border-red-800"
                                  : "bg-blue-950 text-blue-400 border border-blue-800"
                              }`}
                            >
                              {run.status}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold">
                            {score !== null && score !== undefined ? (
                              <span className={scoreColor}>{score} / 100</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-3.5">
                            {run.summary_stats?.pageCoveragePct ? `${run.summary_stats.pageCoveragePct}%` : "—"}
                          </td>
                          <td className="p-3.5">
                            {run.summary_stats?.criticalIssues ? (
                              <span className="text-red-400 font-semibold">{run.summary_stats.criticalIssues} crit</span>
                            ) : (
                              <span className="text-slate-400">0 crit</span>
                            )}
                          </td>
                          <td className="p-3.5 text-slate-400">
                            {new Date(run.created_at).toLocaleDateString()} {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-3.5 text-right">
                            <Link
                              href={`/admin/qa/ui-audit/${run.id}`}
                              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                            >
                              Report
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
