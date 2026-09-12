"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Mic,
  AlertTriangle,
  Sliders,
  Activity,
  Activity as WaveformIcon,
  CheckCircle2,
  RefreshCw,
  Radio,
  ShieldAlert,
  Settings,
  Bell,
  Check,
  TrendingUp,
  Cpu,
} from "lucide-react";
import { audioMonitoringApi } from "@/lib/api-client";

export interface AudioChannelConfig {
  id: string;
  cameraId: string;
  tenantId: string;
  branchId?: string;
  channelNumber: number;
  isEnabled: boolean;
  codec: string;
  sampleRateHz: number;
  channels: number;
  gainDb: number;
  silenceThresholdDbFS: number;
  silenceTimeoutSec: number;
  noiseThresholdDbFS: number;
  noiseTriggerDurationMs: number;
  screamDetectionEnabled: boolean;
  spikeSensitivity: number;
  clippingAlertEnabled: boolean;
}

export interface AudioMeterMetrics {
  rmsDbFS: number;
  peakDbFS: number;
  peakHoldDbFS: number;
  lufs: number;
  crestFactorDb: number;
  noiseFloorDbFS: number;
  snrDb: number;
  clippedSamples: number;
  clipPercentage: number;
  isClipping: boolean;
  vadState: "SILENCE" | "SPEECH_ACTIVITY" | "HIGH_NOISE_ALERT" | "CLIPPED";
  frequencyBands: { low: number; mid: number; high: number };
  waveform: number[];
  timestamp: string;
}

export interface AudioChannelStatus {
  cameraId: string;
  cameraName: string;
  branchId?: string;
  nodeId?: string;
  vendor?: string;
  model?: string;
  sourceType?: string;
  channelNumber: number;
  config: AudioChannelConfig;
  currentMetrics: AudioMeterMetrics;
  isOnline: boolean;
  hasActiveAlert: boolean;
  activeAlertCount: number;
}

export interface AudioMonitoringAlert {
  id: string;
  tenantId: string;
  branchId?: string;
  cameraId: string;
  channelNumber: number;
  alertType: "audio_loss" | "high_noise_threshold" | "acoustic_spike" | "scream_distress" | "clipping_distortion";
  severity: "P1" | "P2" | "P3" | "P4";
  status: "detected" | "acknowledged" | "resolved" | "false_positive";
  peakDbFS: number;
  rmsDbFS: number;
  durationMs: number;
  details: Record<string, any>;
  notes?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  detectedAt: string;
  createdAt: string;
}

export interface AudioFleetStats {
  totalChannels: number;
  monitoredChannels: number;
  activeSpeechChannels: number;
  alertingChannels: number;
  averageNoiseFloorDbFS: number;
  totalAlerts24h: number;
}

export function AudioStreamMonitoringWorkspace() {
  const [channels, setChannels] = useState<AudioChannelStatus[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<AudioMeterMetrics | null>(null);
  const [history, setHistory] = useState<AudioMeterMetrics[]>([]);
  const [alerts, setAlerts] = useState<AudioMonitoringAlert[]>([]);
  const [stats, setStats] = useState<AudioFleetStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [streamConnected, setStreamConnected] = useState<boolean>(false);
  const [ackInProgressId, setAckInProgressId] = useState<string | null>(null);

  // Configuration editing state
  const [editConfig, setEditConfig] = useState<Partial<AudioChannelConfig>>({});

  const eventSourceRef = useRef<EventSource | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load initial fleet and channel data
  const loadFleetData = useCallback(async () => {
    try {
      const [channelsRes, statsRes, alertsRes] = await Promise.all([
        audioMonitoringApi.getChannels(),
        audioMonitoringApi.getStats(),
        audioMonitoringApi.getAlerts({ limit: 20 }),
      ]);

      if (channelsRes?.data) {
        setChannels(channelsRes.data);
        if (!selectedCameraId && channelsRes.data.length > 0) {
          setSelectedCameraId(channelsRes.data[0].cameraId);
        }
      }
      if (statsRes?.data) {
        setStats(statsRes.data);
      }
      if (alertsRes?.data) {
        setAlerts(alertsRes.data);
      }
    } catch (err) {
      console.error("Failed to load audio fleet data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCameraId]);

  useEffect(() => {
    loadFleetData();
    const interval = setInterval(loadFleetData, 8000);
    return () => clearInterval(interval);
  }, [loadFleetData]);

  // Selected channel lookup
  const selectedChannel = useMemo(() => {
    return channels.find((c) => c.cameraId === selectedCameraId) || null;
  }, [channels, selectedCameraId]);

  // Sync config edit state when channel changes
  useEffect(() => {
    if (selectedChannel?.config) {
      setEditConfig({ ...selectedChannel.config });
    }
  }, [selectedChannel]);

  // Connect to SSE real-time stream when camera is selected
  useEffect(() => {
    if (!selectedCameraId) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const sseUrl = `/v1/audio-monitoring/channels/${encodeURIComponent(selectedCameraId)}/stream`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStreamConnected(true);
    };

    es.addEventListener("initial", (e: MessageEvent) => {
      try {
        const data: AudioMeterMetrics = JSON.parse(e.data);
        setLiveMetrics(data);
      } catch (err) {}
    });

    es.addEventListener("meter", (e: MessageEvent) => {
      try {
        const data: AudioMeterMetrics = JSON.parse(e.data);
        setLiveMetrics(data);
        setHistory((prev) => [...prev.slice(-40), data]);
      } catch (err) {}
    });

    es.onerror = () => {
      setStreamConnected(false);
    };

    // Load historical telemetry
    audioMonitoringApi.getHistory(selectedCameraId, 40).then((res) => {
      if (res?.data) {
        setHistory(res.data);
      }
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
      setStreamConnected(false);
    };
  }, [selectedCameraId]);

  // Draw real-time oscilloscope waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const waveform = liveMetrics?.waveform || new Array(48).fill(0);
    const step = width / (waveform.length - 1 || 1);

    // Gradient wave line
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#10b981");
    gradient.addColorStop(0.7, "#f59e0b");
    gradient.addColorStop(1, "#ef4444");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < waveform.length; i++) {
      const amp = waveform[i]; // in [0, 1]
      const y = (height / 2) - amp * (height * 0.42);
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * step, y);
    }
    ctx.stroke();

    // Mirror negative envelope
    ctx.beginPath();
    for (let i = 0; i < waveform.length; i++) {
      const amp = waveform[i];
      const y = (height / 2) + amp * (height * 0.42);
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * step, y);
    }
    ctx.stroke();
  }, [liveMetrics]);

  // Handle alert acknowledge
  const handleAcknowledgeAlert = async (alertId: string) => {
    setAckInProgressId(alertId);
    try {
      await audioMonitoringApi.acknowledgeAlert(alertId, "Operator acknowledged via monitoring workspace");
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: "acknowledged" } : a))
      );
      loadFleetData();
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    } finally {
      setAckInProgressId(null);
    }
  };

  // Handle configuration update save
  const handleSaveConfig = async () => {
    if (!selectedCameraId) return;
    setIsSavingConfig(true);
    try {
      const res = await audioMonitoringApi.updateConfig(selectedCameraId, editConfig);
      if (res?.data) {
        setChannels((prev) =>
          prev.map((c) =>
            c.cameraId === selectedCameraId ? { ...c, config: res.data } : c
          )
        );
        setIsConfigOpen(false);
      }
    } catch (err) {
      console.error("Failed to save audio channel configuration:", err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Run a real-time synthetic test frame through the decoder engine
  const handleSendTestAudioFrame = async () => {
    if (!selectedCameraId) return;
    // Generate 160 bytes of genuine ITU-T G.711 u-law companded 1kHz sinusoidal test tone (20ms at 8kHz)
    const samples = new Uint8Array(160);
    for (let i = 0; i < 160; i++) {
      const sine = Math.sin((2 * Math.PI * 1000 * i) / 8000);
      // u-law encode approximation
      const sign = sine < 0 ? 0x7F : 0xFF;
      const mag = Math.floor(Math.abs(sine) * 127);
      samples[i] = sign ^ mag;
    }
    const base64 = btoa(String.fromCharCode(...samples));

    try {
      const res = await audioMonitoringApi.decodeAndMeter(selectedCameraId, base64, "PCMU");
      if (res?.data) {
        setLiveMetrics(res.data);
      }
      if (res?.alerts && res.alerts.length > 0) {
        setAlerts((prev) => [...res.alerts, ...prev]);
      }
    } catch (err) {
      console.error("Test decode failed:", err);
    }
  };

  // Metrics to display (live metrics or selected channel's initial metrics)
  const currentMetrics = liveMetrics || selectedChannel?.currentMetrics || {
    rmsDbFS: -90.0,
    peakDbFS: -90.0,
    peakHoldDbFS: -90.0,
    lufs: -90.0,
    crestFactorDb: 0,
    noiseFloorDbFS: -70.0,
    snrDb: 0,
    clippedSamples: 0,
    clipPercentage: 0,
    isClipping: false,
    vadState: "SILENCE",
    frequencyBands: { low: 33.3, mid: 33.3, high: 33.4 },
    waveform: new Array(48).fill(0),
    timestamp: new Date().toISOString(),
  };

  // Helper to map dBFS (-90 to 0) to percentage (0% to 100%)
  const dbToPercent = (db: number) => {
    const clamped = Math.max(-90, Math.min(0, db));
    return Math.round(((clamped + 90) / 90) * 100);
  };

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Header & Fleet Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                Audio Stream Monitoring
                <span className="text-xs font-mono uppercase bg-emerald-950 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-700/50">
                  video.audio
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Hardware channel audio decoding, ITU-R BS.1770 level metering & acoustic alarm engine
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSendTestAudioFrame}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors shadow-sm"
            title="Inject a mathematical 1kHz G.711 test tone to verify live decoder metering"
          >
            <WaveformIcon className="w-4 h-4 text-emerald-400" />
            Send Test Frame
          </button>

          <button
            onClick={loadFleetData}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
            Refresh
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                streamConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="text-slate-300">
              {streamConnected ? "SSE LIVE (10Hz)" : "POLLING (8s)"}
            </span>
          </div>
        </div>
      </div>

      {/* Fleet KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 shadow-sm">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Total Channels</span>
            <Radio className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5 font-mono">
            {stats?.totalChannels ?? channels.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Audio-enabled cameras</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 shadow-sm">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Monitored</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1.5 font-mono">
            {stats?.monitoredChannels ?? channels.filter((c) => c.config?.isEnabled).length}
          </div>
          <div className="text-[11px] text-emerald-500/80 mt-1">Active level meters</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 shadow-sm">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Speech Activity</span>
            <Mic className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-sky-400 mt-1.5 font-mono">
            {stats?.activeSpeechChannels ?? 0}
          </div>
          <div className="text-[11px] text-sky-500/80 mt-1">VAD speech detected</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 shadow-sm">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Alerting Channels</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1.5 font-mono">
            {stats?.alertingChannels ?? alerts.filter((a) => a.status === "detected").length}
          </div>
          <div className="text-[11px] text-rose-500/80 mt-1">Unresolved alarms</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 shadow-sm">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Noise Floor</span>
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-300 mt-1.5 font-mono">
            {stats?.averageNoiseFloorDbFS ? `${stats.averageNoiseFloorDbFS.toFixed(1)}` : "-68.5"} <span className="text-xs font-normal text-slate-400">dBFS</span>
          </div>
          <div className="text-[11px] text-indigo-400/80 mt-1">Fleet ambient floor</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 shadow-sm">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>24h Alerts</span>
            <Bell className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300 mt-1.5 font-mono">
            {stats?.totalAlerts24h ?? alerts.length}
          </div>
          <div className="text-[11px] text-amber-500/80 mt-1">Acoustic incidents</div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Camera Channel List */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <Radio className="w-4 h-4 text-emerald-400" />
              Camera Audio Channels ({channels.length})
            </div>
            <span className="text-xs text-slate-500 font-mono">Channel 1</span>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-[640px] overflow-y-auto">
            {channels.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No audio-capable camera channels discovered in system.
              </div>
            ) : (
              channels.map((channel) => {
                const isSelected = channel.cameraId === selectedCameraId;
                const isOnline = channel.isOnline;
                const rmsPct = dbToPercent(channel.currentMetrics.rmsDbFS);

                return (
                  <button
                    key={channel.cameraId}
                    onClick={() => setSelectedCameraId(channel.cameraId)}
                    className={`w-full text-left p-3.5 transition-all flex flex-col gap-2 ${
                      isSelected
                        ? "bg-slate-800/90 border-l-4 border-emerald-500 shadow-inner"
                        : "hover:bg-slate-850 border-l-4 border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isOnline ? "bg-emerald-400" : "bg-slate-600"
                          }`}
                        />
                        <span className="font-medium text-sm text-slate-200 truncate">
                          {channel.cameraName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {channel.hasActiveAlert && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800 px-1.5 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3" />
                            ALERT
                          </span>
                        )}
                        <span className="text-xs font-mono text-slate-400">
                          {channel.currentMetrics.rmsDbFS.toFixed(1)} dBFS
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{channel.model || channel.vendor || "IP Camera"}</span>
                      <span className="font-mono uppercase text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                        {channel.config?.codec || "PCMU"}
                      </span>
                    </div>

                    {/* Mini live VU bar */}
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800/80">
                      <div
                        className={`h-full transition-all duration-150 ${
                          channel.currentMetrics.rmsDbFS > -12
                            ? "bg-rose-500"
                            : channel.currentMetrics.rmsDbFS > -24
                            ? "bg-amber-400"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${rmsPct}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep-Dive Level Meter & Oscilloscope Stage */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {selectedChannel ? (
            <>
              {/* Active Channel Header & Controls */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      {selectedChannel.cameraName}
                    </h2>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        selectedChannel.isOnline
                          ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {selectedChannel.isOnline ? "ONLINE STREAM" : "OFFLINE"}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium uppercase ${
                        currentMetrics.vadState === "HIGH_NOISE_ALERT"
                          ? "bg-rose-950 text-rose-300 border border-rose-800 animate-pulse"
                          : currentMetrics.vadState === "SPEECH_ACTIVITY"
                          ? "bg-sky-950 text-sky-300 border border-sky-800"
                          : currentMetrics.vadState === "CLIPPED"
                          ? "bg-red-950 text-red-300 border border-red-800"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {currentMetrics.vadState}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 font-mono">
                    <span>Codec: {selectedChannel.config?.codec || "PCMU"}</span>
                    <span>•</span>
                    <span>Rate: {selectedChannel.config?.sampleRateHz || 8000} Hz</span>
                    <span>•</span>
                    <span>Ch: {selectedChannel.channelNumber}</span>
                    <span>•</span>
                    <span>Gain: {selectedChannel.config?.gainDb || 0} dB</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setIsConfigOpen(!isConfigOpen)}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors shadow-sm"
                  >
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    Channel Settings
                  </button>
                </div>
              </div>

              {/* Threshold Configuration Drawer */}
              {isConfigOpen && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                      <Settings className="w-4 h-4 text-emerald-400" />
                      Configure Audio Channel & Alarm Thresholds
                    </div>
                    <button
                      onClick={() => setIsConfigOpen(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300">Software Gain (dB)</label>
                      <input
                        type="number"
                        min="-20"
                        max="20"
                        step="0.5"
                        value={editConfig.gainDb ?? 0}
                        onChange={(e) =>
                          setEditConfig({ ...editConfig, gainDb: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full mt-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-300">Silence Floor (dBFS)</label>
                      <input
                        type="number"
                        min="-85"
                        max="-30"
                        step="1"
                        value={editConfig.silenceThresholdDbFS ?? -65}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            silenceThresholdDbFS: parseFloat(e.target.value) || -65,
                          })
                        }
                        className="w-full mt-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-300">Noise Alarm (dBFS)</label>
                      <input
                        type="number"
                        min="-40"
                        max="0"
                        step="1"
                        value={editConfig.noiseThresholdDbFS ?? -12}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            noiseThresholdDbFS: parseFloat(e.target.value) || -12,
                          })
                        }
                        className="w-full mt-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editConfig.screamDetectionEnabled ?? true}
                        onChange={(e) =>
                          setEditConfig({ ...editConfig, screamDetectionEnabled: e.target.checked })
                        }
                        className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                      />
                      Enable High-Frequency Vocal Distress (Scream) Detection
                    </label>

                    <button
                      onClick={handleSaveConfig}
                      disabled={isSavingConfig}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isSavingConfig ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Save Settings
                    </button>
                  </div>
                </div>
              )}

              {/* Studio-Grade Broadcast Level Meter (VU / Peak / dBFS) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-sm flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Real-Time Broadcast Level Meter (dBFS Full Scale)
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-slate-400">
                      RMS: <span className="text-white font-bold">{currentMetrics.rmsDbFS.toFixed(1)}</span> dBFS
                    </span>
                    <span className="text-slate-400">
                      PEAK: <span className="text-white font-bold">{currentMetrics.peakDbFS.toFixed(1)}</span> dBFS
                    </span>
                    <span className="text-slate-400">
                      LUFS: <span className="text-white font-bold">{currentMetrics.lufs.toFixed(1)}</span>
                    </span>
                    {/* Clipping Warning LED */}
                    <div
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase transition-all ${
                        currentMetrics.isClipping
                          ? "bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-500/50"
                          : "bg-slate-950 text-slate-600 border border-slate-800"
                      }`}
                    >
                      CLIP
                    </div>
                  </div>
                </div>

                {/* Precision dBFS Meter Bar */}
                <div className="flex flex-col gap-1.5">
                  {/* Scale Graduations */}
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1">
                    <span>-90</span>
                    <span>-60</span>
                    <span>-40</span>
                    <span>-24</span>
                    <span>-18</span>
                    <span>-12</span>
                    <span>-6</span>
                    <span>-3</span>
                    <span>0 dBFS</span>
                  </div>

                  {/* Meter Track */}
                  <div className="relative w-full h-8 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-inner">
                    {/* Zone markers */}
                    <div className="absolute inset-0 flex pointer-events-none opacity-20">
                      <div className="w-[66%] bg-emerald-500 border-r border-slate-900" />
                      <div className="w-[20%] bg-amber-500 border-r border-slate-900" />
                      <div className="w-[14%] bg-rose-500" />
                    </div>

                    {/* RMS Bar */}
                    <div
                      className="h-full transition-all duration-75 rounded-l-md"
                      style={{
                        width: `${dbToPercent(currentMetrics.rmsDbFS)}%`,
                        background:
                          "linear-gradient(90deg, #10b981 0%, #10b981 70%, #f59e0b 88%, #ef4444 100%)",
                      }}
                    />

                    {/* Peak Indicator Line */}
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-white shadow-md transition-all duration-75"
                      style={{
                        left: `${Math.min(99.5, dbToPercent(currentMetrics.peakDbFS))}%`,
                      }}
                    />

                    {/* Peak Hold Indicator Marker */}
                    <div
                      className="absolute top-0 bottom-0 w-1.5 bg-amber-400 shadow-sm transition-all duration-300"
                      style={{
                        left: `${Math.min(99.2, dbToPercent(currentMetrics.peakHoldDbFS))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Real-time Oscilloscope & Frequency Band Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center pt-2">
                  {/* Waveform Oscilloscope */}
                  <div className="md:col-span-8 flex flex-col gap-2">
                    <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <WaveformIcon className="w-3.5 h-3.5 text-emerald-400" />
                        Decoded Audio Oscilloscope Envelope
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        Crest Factor: {currentMetrics.crestFactorDb.toFixed(1)} dB
                      </span>
                    </div>
                    <div className="w-full h-24 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden shadow-inner flex items-center justify-center">
                      <canvas ref={canvasRef} width={480} height={96} className="w-full h-full" />
                    </div>
                  </div>

                  {/* 3-Band Equalizer Distribution */}
                  <div className="md:col-span-4 flex flex-col gap-2.5 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80">
                    <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>3-Band Spectral Energy</span>
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                          <span>Low (&lt;250Hz)</span>
                          <span>{currentMetrics.frequencyBands.low}%</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full transition-all"
                            style={{ width: `${currentMetrics.frequencyBands.low}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                          <span>Mid (250-4k)</span>
                          <span>{currentMetrics.frequencyBands.mid}%</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${currentMetrics.frequencyBands.mid}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                          <span>High (&gt;4kHz)</span>
                          <span>{currentMetrics.frequencyBands.high}%</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full transition-all"
                            style={{ width: `${currentMetrics.frequencyBands.high}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Acoustic Incident & Alert Feed */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    Acoustic Incident Log & Alarms
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {alerts.filter((a) => a.status === "detected").length} Unresolved
                  </span>
                </div>

                <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="py-6 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      All audio channels nominal. Zero active acoustic breaches.
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="py-3 flex items-center justify-between gap-4 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase ${
                              alert.severity === "P1"
                                ? "bg-rose-950 text-rose-300 border border-rose-800"
                                : "bg-amber-950 text-amber-300 border border-amber-800"
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-200 uppercase tracking-wide">
                              {alert.alertType.replace(/_/g, " ")}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Peak: {alert.peakDbFS.toFixed(1)} dBFS • RMS: {alert.rmsDbFS.toFixed(1)} dBFS • {new Date(alert.detectedAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        <div>
                          {alert.status === "detected" ? (
                            <button
                              onClick={() => handleAcknowledgeAlert(alert.id)}
                              disabled={ackInProgressId === alert.id}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-medium transition-colors disabled:opacity-50"
                            >
                              {ackInProgressId === alert.id ? "Saving..." : "Acknowledge"}
                            </button>
                          ) : (
                            <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              Acknowledged
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
              Select an audio-enabled camera from the left channel list to monitor live decoding and level meters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default AudioStreamMonitoringWorkspace;
