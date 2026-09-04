"use client";

import React, { useState, useEffect } from "react";
import {
  Camera,
  Video,
  Sliders,
  Network,
  Clock,
  Mic,
  Move,
  Bell,
  History,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  ExternalLink,
  Cpu,
  Layers,
} from "lucide-react";
import { deviceConfigurationApi } from "@/lib/api-client";
import { NetworkConfigPanel } from "./network-config-panel";
import { TimeSyncPanel } from "./time-sync-panel";
import { RollbackSnapshotsModal } from "./rollback-snapshots-modal";

interface CameraConfigurationViewProps {
  cameraId: string;
  cameraName?: string;
  cameraIp?: string;
  nodeId?: string;
  onRefresh?: () => void;
}

type TabType =
  | "general"
  | "video"
  | "imaging"
  | "network"
  | "time"
  | "audio"
  | "ptz"
  | "events"
  | "rollback";

export function CameraConfigurationView({
  cameraId,
  cameraName,
  cameraIp,
  nodeId,
  onRefresh,
}: CameraConfigurationViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("video");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
    drifts?: any[];
  } | null>(null);

  // Modal state
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);

  // Hardware state & options
  const [videoConfig, setVideoConfig] = useState<any | null>(null);
  const [videoOptions, setVideoOptions] = useState<any | null>(null);
  const [imageConfig, setImageConfig] = useState<any | null>(null);
  const [imageOptions, setImageOptions] = useState<any | null>(null);

  // Form states for Video
  const [codec, setCodec] = useState("H264");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(25);
  const [bitrateKbps, setBitrateKbps] = useState(4096);
  const [quality, setQuality] = useState(80);
  const [govLength, setGovLength] = useState(50);
  const [h264Profile, setH264Profile] = useState<string>("Main");

  // Form states for Imaging
  const [brightness, setBrightness] = useState(50);
  const [contrast, setContrast] = useState(50);
  const [colorSaturation, setColorSaturation] = useState(50);
  const [sharpness, setSharpness] = useState(50);
  const [irCutFilter, setIrCutFilter] = useState("AUTO");
  const [wdrMode, setWdrMode] = useState("OFF");
  const [wdrLevel, setWdrLevel] = useState(50);
  const [exposureMode, setExposureMode] = useState("AUTO");
  const [whiteBalanceMode, setWhiteBalanceMode] = useState("AUTO");

  // Form states for Audio / PTZ / Events
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioCodec, setAudioCodec] = useState("G711A");
  const [audioInputGain, setAudioInputGain] = useState(70);

  const [ptzSpeedLimit, setPtzSpeedLimit] = useState(80);
  const [ptzHomePreset, setPtzHomePreset] = useState("Preset 1 (Banking Hall Overview)");

  const [motionDetectionEnabled, setMotionDetectionEnabled] = useState(true);
  const [tamperDetectionEnabled, setTamperDetectionEnabled] = useState(true);
  const [motionSensitivity, setMotionSensitivity] = useState(75);

  const loadCameraData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Video configuration & hardware options
      const [vCfgRes, vOptRes] = await Promise.allSettled([
        deviceConfigurationApi.getVideoConfiguration(cameraId),
        deviceConfigurationApi.getVideoOptions(cameraId),
      ]);

      if (vCfgRes.status === "fulfilled" && vCfgRes.value.data) {
        const v = vCfgRes.value.data;
        setVideoConfig(v);
        if (v.codec) setCodec(v.codec);
        if (v.resolution) {
          setWidth(v.resolution.width);
          setHeight(v.resolution.height);
        }
        if (v.fps) setFps(v.fps);
        if (v.bitrateKbps) setBitrateKbps(v.bitrateKbps);
        if (v.quality) setQuality(v.quality);
        if (v.govLength) setGovLength(v.govLength);
        if (v.h264Profile) setH264Profile(v.h264Profile);
      }

      if (vOptRes.status === "fulfilled" && vOptRes.value.data) {
        setVideoOptions(vOptRes.value.data);
      }

      // 2. Imaging configuration & hardware options
      const [imgCfgRes, imgOptRes] = await Promise.allSettled([
        deviceConfigurationApi.getImagingConfiguration(cameraId),
        deviceConfigurationApi.getImagingOptions(cameraId),
      ]);

      if (imgCfgRes.status === "fulfilled" && imgCfgRes.value.data) {
        const img = imgCfgRes.value.data;
        setImageConfig(img);
        if (img.brightness !== undefined) setBrightness(img.brightness);
        if (img.contrast !== undefined) setContrast(img.contrast);
        if (img.colorSaturation !== undefined) setColorSaturation(img.colorSaturation);
        if (img.sharpness !== undefined) setSharpness(img.sharpness);
        if (img.irCutFilter) setIrCutFilter(img.irCutFilter);
        if (img.wideDynamicRange?.mode) setWdrMode(img.wideDynamicRange.mode);
        if (img.wideDynamicRange?.level) setWdrLevel(img.wideDynamicRange.level);
        if (img.exposure?.mode) setExposureMode(img.exposure.mode);
        if (img.whiteBalance?.mode) setWhiteBalanceMode(img.whiteBalance.mode);
      }

      if (imgOptRes.status === "fulfilled" && imgOptRes.value.data) {
        setImageOptions(imgOptRes.value.data);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load camera configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cameraId) {
      loadCameraData();
    }
  }, [cameraId]);

  const handleSaveVideo = async () => {
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const payload: any = {
        codec,
        resolution: { width: Number(width), height: Number(height) },
        fps: Number(fps),
        bitrateKbps: Number(bitrateKbps),
        quality: Number(quality),
        govLength: Number(govLength),
        h264Profile,
      };

      const res = await deviceConfigurationApi.setVideoConfiguration(cameraId, payload);
      const applyResult = res.data;

      if (applyResult?.success) {
        setFeedback({
          type: "success",
          message: "Video encoder settings applied and verified on physical hardware (Read-After-Write: VERIFIED).",
        });
        await loadCameraData();
      } else {
        setFeedback({
          type: "warning",
          message: applyResult?.message || "Configuration applied but hardware verification detected parameter drift.",
          drifts: applyResult?.verification?.drifts,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to apply video configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveImaging = async () => {
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const payload: any = {
        brightness: Number(brightness),
        contrast: Number(contrast),
        colorSaturation: Number(colorSaturation),
        sharpness: Number(sharpness),
        irCutFilter,
        wideDynamicRange: {
          mode: wdrMode,
          level: Number(wdrLevel),
        },
        exposure: {
          mode: exposureMode,
        },
        whiteBalance: {
          mode: whiteBalanceMode,
        },
      };

      const res = await deviceConfigurationApi.setImagingConfiguration(cameraId, payload);
      const applyResult = res.data;

      if (applyResult?.success) {
        setFeedback({
          type: "success",
          message: "Imaging settings applied and verified on physical hardware (Read-After-Write: VERIFIED).",
        });
        await loadCameraData();
      } else {
        setFeedback({
          type: "warning",
          message: applyResult?.message || "Imaging applied but hardware verification detected parameter drift.",
          drifts: applyResult?.verification?.drifts,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to apply imaging configuration");
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: "general", label: "General", icon: Camera },
    { id: "video", label: "Video Encoder", icon: Video },
    { id: "imaging", label: "Image / ISP", icon: Sliders },
    { id: "network", label: "Network (Safe)", icon: Network },
    { id: "time", label: "Time & NTP", icon: Clock },
    { id: "audio", label: "Audio", icon: Mic },
    { id: "ptz", label: "PTZ & Presets", icon: Move },
    { id: "events", label: "Events & VMD", icon: Bell },
    { id: "rollback", label: "Audit & Rollback", icon: History },
  ];

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
              <Camera className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {cameraName || "IP Camera"}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-500/30">
                  ONLINE
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono text-slate-400 bg-slate-800">
                  {cameraIp || "127.0.0.1"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                ID: <span className="font-mono text-slate-300">{cameraId}</span> • Node:{" "}
                <span className="font-mono text-slate-300">{nodeId || "Root"}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start lg:self-auto">
            <button
              type="button"
              onClick={loadCameraData}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Query Hardware
            </button>
            <button
              type="button"
              onClick={() => setIsRollbackOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-950/50 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 transition shadow-sm"
            >
              <History className="w-3.5 h-3.5 text-indigo-400" />
              Rollback History
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`mt-4 p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
              feedback.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                : feedback.type === "warning"
                ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                : "bg-rose-950/60 border-rose-500/40 text-rose-300"
            }`}
          >
            {feedback.type === "success" ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="font-semibold">{feedback.message}</span>
              {feedback.drifts && feedback.drifts.length > 0 && (
                <div className="mt-2 space-y-1">
                  <span className="font-medium text-slate-300">Read-Back Hardware Differences:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 font-mono text-[11px]">
                    {feedback.drifts.map((d, i) => (
                      <li key={i}>{d.differenceSummary || `${d.path}: expected ${d.desired}, got ${d.actual}`}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 mt-5 pt-3 border-t border-slate-800/80 overflow-x-auto pb-1 scrollbar-thin">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                    : "bg-slate-950/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: General */}
      {activeTab === "general" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Camera className="w-4 h-4 text-indigo-400" />
            Device Information & Hardware Profiles
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Camera Name</span>
              <span className="text-slate-100 font-semibold text-sm">{cameraName || "IP Camera"}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Device ID</span>
              <span className="font-mono text-slate-200">{cameraId}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Target IPv4 Address</span>
              <span className="font-mono text-slate-200">{cameraIp || "127.0.0.1"}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">ONVIF Profile Token</span>
              <span className="font-mono text-slate-200">
                {videoConfig?.streamProfileToken || "Profile_1 (Main)"}
              </span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Management Node ID</span>
              <span className="font-mono text-slate-200">{nodeId || "root"}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Protocol Standard</span>
              <span className="text-emerald-400 font-semibold">ONVIF Profile S / Profile T</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Video Encoder with Side-by-Side Comparison */}
      {activeTab === "video" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Video className="w-4 h-4 text-indigo-400" />
              Video Encoder Parameters (Side-by-Side Verification)
            </h3>
            <span className="text-xs text-slate-400">
              Changes trigger physical SetVideoEncoderConfiguration & Read-After-Write verify
            </span>
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Parameter</th>
                  <th className="px-4 py-3">Current Hardware Value</th>
                  <th className="px-4 py-3">Supported Hardware Range</th>
                  <th className="px-4 py-3">Desired Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {/* Codec */}
                <tr className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-sans font-medium text-slate-300">Codec</td>
                  <td className="px-4 py-3 text-slate-200">{videoConfig?.codec || "H264"}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {videoOptions?.supportedCodecs?.join(", ") || "H264, H265, MJPEG"}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <select
                      value={codec}
                      onChange={(e) => setCodec(e.target.value)}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      <option value="H264">H264</option>
                      <option value="H265">H265 (High Efficiency)</option>
                      <option value="MJPEG">MJPEG</option>
                    </select>
                  </td>
                </tr>

                {/* Resolution */}
                <tr className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-sans font-medium text-slate-300">Resolution</td>
                  <td className="px-4 py-3 text-slate-200">
                    {videoConfig?.resolution ? `${videoConfig.resolution.width}x${videoConfig.resolution.height}` : "1920x1080"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {videoOptions?.supportedResolutions
                      ? videoOptions.supportedResolutions.map((r: any) => `${r.width}x${r.height}`).join(", ")
                      : "1920x1080, 1280x720, 640x480"}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <select
                      value={`${width}x${height}`}
                      onChange={(e) => {
                        const [w, h] = e.target.value.split("x").map(Number);
                        setWidth(w);
                        setHeight(h);
                      }}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      {videoOptions?.supportedResolutions && videoOptions.supportedResolutions.length > 0 ? (
                        videoOptions.supportedResolutions.map((r: any) => (
                          <option key={`${r.width}x${r.height}`} value={`${r.width}x${r.height}`}>
                            {r.width}x{r.height}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="1920x1080">1920x1080 (1080p FHD)</option>
                          <option value="1280x720">1280x720 (720p HD)</option>
                          <option value="640x480">640x480 (VGA)</option>
                        </>
                      )}
                    </select>
                  </td>
                </tr>

                {/* Frame Rate (FPS) */}
                <tr className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-sans font-medium text-slate-300">Frame Rate (FPS)</td>
                  <td className="px-4 py-3 text-slate-200">{videoConfig?.fps ?? 25} fps</td>
                  <td className="px-4 py-3 text-slate-400">
                    {videoOptions?.fpsRange ? `[${videoOptions.fpsRange.min} - ${videoOptions.fpsRange.max}]` : "[1 - 60]"}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={videoOptions?.fpsRange?.min ?? 1}
                        max={videoOptions?.fpsRange?.max ?? 60}
                        value={fps}
                        onChange={(e) => setFps(Number(e.target.value))}
                        className="w-20 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                      />
                      <span className="text-slate-400 text-xs">fps</span>
                    </div>
                  </td>
                </tr>

                {/* Bitrate (Kbps) */}
                <tr className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-sans font-medium text-slate-300">Bitrate Limit</td>
                  <td className="px-4 py-3 text-slate-200">{videoConfig?.bitrateKbps ?? 4096} kbps</td>
                  <td className="px-4 py-3 text-slate-400">
                    {videoOptions?.bitrateRangeKbps
                      ? `[${videoOptions.bitrateRangeKbps.min} - ${videoOptions.bitrateRangeKbps.max}]`
                      : "[128 - 16384]"}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="256"
                        min={videoOptions?.bitrateRangeKbps?.min ?? 128}
                        max={videoOptions?.bitrateRangeKbps?.max ?? 16384}
                        value={bitrateKbps}
                        onChange={(e) => setBitrateKbps(Number(e.target.value))}
                        className="w-24 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                      />
                      <span className="text-slate-400 text-xs">kbps</span>
                    </div>
                  </td>
                </tr>

                {/* Gov Length / GOP */}
                <tr className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-sans font-medium text-slate-300">GOP / Gov Length</td>
                  <td className="px-4 py-3 text-slate-200">{videoConfig?.govLength ?? 50} frames</td>
                  <td className="px-4 py-3 text-slate-400">
                    {videoOptions?.govLengthRange
                      ? `[${videoOptions.govLengthRange.min} - ${videoOptions.govLengthRange.max}]`
                      : "[1 - 120]"}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <input
                      type="number"
                      min={videoOptions?.govLengthRange?.min ?? 1}
                      max={videoOptions?.govLengthRange?.max ?? 120}
                      value={govLength}
                      onChange={(e) => setGovLength(Number(e.target.value))}
                      className="w-20 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                    />
                  </td>
                </tr>

                {/* H.264 Profile */}
                <tr className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-sans font-medium text-slate-300">H.264 Profile</td>
                  <td className="px-4 py-3 text-slate-200">{videoConfig?.h264Profile || "Main"}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {videoOptions?.profilesSupported?.join(", ") || "Baseline, Main, High"}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <select
                      value={h264Profile}
                      onChange={(e) => setH264Profile(e.target.value)}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      <option value="Baseline">Baseline</option>
                      <option value="Main">Main</option>
                      <option value="High">High</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={loadCameraData}
              disabled={loading || saving}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Reset Values
            </button>
            <button
              type="button"
              onClick={handleSaveVideo}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Applying & Verifying Hardware...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Apply Video Configuration
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Imaging / ISP */}
      {activeTab === "imaging" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Image Signal Processing (ISP) & Optical Controls
            </h3>
            <span className="text-xs text-slate-400">
              Hardware range validated via GetImagingSettings
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Brightness */}
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-300">Brightness</span>
                <span className="font-mono text-slate-200 font-bold">{brightness}%</span>
              </div>
              <input
                type="range"
                min={imageOptions?.brightnessRange?.min ?? 0}
                max={imageOptions?.brightnessRange?.max ?? 100}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Min: {imageOptions?.brightnessRange?.min ?? 0}</span>
                <span>Current: {imageConfig?.brightness ?? 50}</span>
                <span>Max: {imageOptions?.brightnessRange?.max ?? 100}</span>
              </div>
            </div>

            {/* Contrast */}
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-300">Contrast</span>
                <span className="font-mono text-slate-200 font-bold">{contrast}%</span>
              </div>
              <input
                type="range"
                min={imageOptions?.contrastRange?.min ?? 0}
                max={imageOptions?.contrastRange?.max ?? 100}
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Min: {imageOptions?.contrastRange?.min ?? 0}</span>
                <span>Current: {imageConfig?.contrast ?? 50}</span>
                <span>Max: {imageOptions?.contrastRange?.max ?? 100}</span>
              </div>
            </div>

            {/* Saturation */}
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-300">Color Saturation</span>
                <span className="font-mono text-slate-200 font-bold">{colorSaturation}%</span>
              </div>
              <input
                type="range"
                min={imageOptions?.colorSaturationRange?.min ?? 0}
                max={imageOptions?.colorSaturationRange?.max ?? 100}
                value={colorSaturation}
                onChange={(e) => setColorSaturation(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Min: {imageOptions?.colorSaturationRange?.min ?? 0}</span>
                <span>Current: {imageConfig?.colorSaturation ?? 50}</span>
                <span>Max: {imageOptions?.colorSaturationRange?.max ?? 100}</span>
              </div>
            </div>

            {/* Sharpness */}
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-300">Sharpness</span>
                <span className="font-mono text-slate-200 font-bold">{sharpness}%</span>
              </div>
              <input
                type="range"
                min={imageOptions?.sharpnessRange?.min ?? 0}
                max={imageOptions?.sharpnessRange?.max ?? 100}
                value={sharpness}
                onChange={(e) => setSharpness(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Min: {imageOptions?.sharpnessRange?.min ?? 0}</span>
                <span>Current: {imageConfig?.sharpness ?? 50}</span>
                <span>Max: {imageOptions?.sharpnessRange?.max ?? 100}</span>
              </div>
            </div>

            {/* IR Cut Filter */}
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <label className="text-xs font-medium text-slate-300 block">
                Day / Night IR Cut Filter
              </label>
              <select
                value={irCutFilter}
                onChange={(e) => setIrCutFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
              >
                <option value="AUTO">AUTO (Ambient Light Sensor)</option>
                <option value="ON">ON (Day Mode - Color Filter Active)</option>
                <option value="OFF">OFF (Night Mode - IR Sensitive Monochrome)</option>
              </select>
            </div>

            {/* Wide Dynamic Range (WDR) */}
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <label className="text-xs font-medium text-slate-300 block">
                Wide Dynamic Range (WDR / Banking Backlight)
              </label>
              <div className="flex gap-2">
                <select
                  value={wdrMode}
                  onChange={(e) => setWdrMode(e.target.value)}
                  className="w-1/2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                >
                  <option value="OFF">OFF</option>
                  <option value="ON">ON</option>
                </select>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={wdrLevel}
                  disabled={wdrMode === "OFF"}
                  onChange={(e) => setWdrLevel(Number(e.target.value))}
                  placeholder="Level"
                  className="w-1/2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono disabled:opacity-40"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={loadCameraData}
              disabled={loading || saving}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Reset Values
            </button>
            <button
              type="button"
              onClick={handleSaveImaging}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Applying & Verifying ISP...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Apply Imaging Configuration
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Network (Safe & Anti-Lockout) */}
      {activeTab === "network" && (
        <NetworkConfigPanel
          deviceId={cameraId}
          isRecorder={false}
          onConfigChanged={() => {
            loadCameraData();
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Tab 5: Time & NTP */}
      {activeTab === "time" && (
        <TimeSyncPanel
          deviceId={cameraId}
          isRecorder={false}
          onConfigChanged={() => {
            loadCameraData();
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Tab 6: Audio */}
      {activeTab === "audio" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Mic className="w-4 h-4 text-indigo-400" />
            Audio Input & Encoding Configuration
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
                <input
                  type="checkbox"
                  checked={audioEnabled}
                  onChange={(e) => setAudioEnabled(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600"
                />
                Enable Microphone Input Stream
              </label>
              <p className="text-[11px] text-slate-400">
                Notice: Banking audio recording is subject to strict employee and customer privacy consent regulations.
              </p>
            </div>

            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <label className="font-medium text-slate-300 block">Audio Compression Format</label>
              <select
                value={audioCodec}
                onChange={(e) => setAudioCodec(e.target.value)}
                disabled={!audioEnabled}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white disabled:opacity-40"
              >
                <option value="G711A">G.711 A-law (Standard Banking Intercom)</option>
                <option value="G711U">G.711 &mu;-law</option>
                <option value="AAC">AAC (High Quality)</option>
                <option value="G726">G.726 ADPCM</option>
              </select>
            </div>

            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2 md:col-span-2">
              <div className="flex justify-between">
                <span className="font-medium text-slate-300">Input Gain / Sensitivity</span>
                <span className="font-mono text-slate-200">{audioInputGain}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={audioInputGain}
                disabled={!audioEnabled}
                onChange={(e) => setAudioInputGain(Number(e.target.value))}
                className="w-full accent-indigo-500 disabled:opacity-40"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: PTZ & Presets */}
      {activeTab === "ptz" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Move className="w-4 h-4 text-indigo-400" />
            Pan / Tilt / Zoom Speed & Preset Automation
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <label className="font-medium text-slate-300 block">Home / Idle Return Preset</label>
              <select
                value={ptzHomePreset}
                onChange={(e) => setPtzHomePreset(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
              >
                <option value="Preset 1">Preset 1 (Banking Hall Overview)</option>
                <option value="Preset 2">Preset 2 (Teller Counter Zoom)</option>
                <option value="Preset 3">Preset 3 (Strongroom Vault Doorway)</option>
                <option value="Preset 4">Preset 4 (ATM Vestibule)</option>
              </select>
            </div>

            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between">
                <span className="font-medium text-slate-300">PTZ Slewing Speed Limit</span>
                <span className="font-mono text-slate-200">{ptzSpeedLimit}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={ptzSpeedLimit}
                onChange={(e) => setPtzSpeedLimit(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Events & VMD */}
      {activeTab === "events" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            Hardware Video Motion Detection (VMD) & Tamper Events
          </h3>

          <div className="space-y-3 text-xs">
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-200 block">Hardware Motion Detection</span>
                <span className="text-[11px] text-slate-400">
                  Sends ONVIF RuleEngineDetected events on motion in view.
                </span>
              </div>
              <input
                type="checkbox"
                checked={motionDetectionEnabled}
                onChange={(e) => setMotionDetectionEnabled(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600"
              />
            </div>

            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-200 block">Lens Defocus & Tamper Alarm</span>
                <span className="text-[11px] text-slate-400">
                  Detects camera occlusion, spray paint, or physical repositioning.
                </span>
              </div>
              <input
                type="checkbox"
                checked={tamperDetectionEnabled}
                onChange={(e) => setTamperDetectionEnabled(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600"
              />
            </div>

            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between">
                <span className="font-medium text-slate-300">Motion Detection Sensitivity</span>
                <span className="font-mono text-slate-200">{motionSensitivity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={motionSensitivity}
                onChange={(e) => setMotionSensitivity(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 9: Audit & Rollback */}
      {activeTab === "rollback" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" />
              Pre-Flight Snapshots & Audit Log Integrity
            </h3>
            <button
              type="button"
              onClick={() => setIsRollbackOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition"
            >
              <History className="w-3.5 h-3.5" />
              Open Rollback Manager
            </button>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs space-y-2 text-slate-300">
            <p>
              Every mutation performed through the Device Configuration Center captures an unchangeable pre-flight snapshot before dispatching ONVIF commands.
            </p>
            <p className="text-slate-400">
              If physical Read-After-Write verification fails, an automatic rollback is triggered, or administrators can manually restore any historical snapshot.
            </p>
          </div>
        </div>
      )}

      {/* Rollback Modal */}
      <RollbackSnapshotsModal
        deviceId={cameraId}
        deviceName={cameraName}
        isOpen={isRollbackOpen}
        onClose={() => setIsRollbackOpen(false)}
        onRolledBack={() => {
          loadCameraData();
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
}
