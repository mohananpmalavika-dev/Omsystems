"use client";

import { useEffect, useState, useRef } from "react";
import {
  Mic,
  Volume2,
  ShieldAlert,
  AlertTriangle,
  Play,
  RotateCw,
  Sliders,
  CheckCircle2,
  BellRing,
  Building2,
  Camera,
  Activity,
  Compass,
  Radio,
  Zap,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import {
  acousticAiApi,
  type AcousticRuleItem,
  type AcousticBlindSpotItem,
  type AcousticAnomalyEventItem,
  type AcousticFleetStatsItem,
} from "@/lib/api-client";

export function AcousticAiWorkspace() {
  const [rules, setRules] = useState<AcousticRuleItem[]>([]);
  const [blindSpots, setBlindSpots] = useState<AcousticBlindSpotItem[]>([]);
  const [events, setEvents] = useState<AcousticAnomalyEventItem[]>([]);
  const [stats, setStats] = useState<AcousticFleetStatsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active filters
  const [selectedSignatureFilter, setSelectedSignatureFilter] = useState<string>("all");
  const [blindSpotOnlyFilter, setBlindSpotOnlyFilter] = useState(false);

  // Simulation Form State
  const [simCameraId, setSimCameraId] = useState("cam-main-entrance");
  const [simBranchId, setSimBranchId] = useState("branch-101");
  const [simSignature, setSimSignature] = useState<'glass_break' | 'screaming_aggression' | 'gunshot_blast' | 'shutter_tamper_breach'>('glass_break');
  const [simIsBlindSpot, setSimIsBlindSpot] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<{
    event: AcousticAnomalyEventItem;
    classification: any;
    blindSpotResult: any;
  } | null>(null);

  // Audio Playback Simulation State
  const [playingSignature, setPlayingSignature] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Modal State for Rule Creation
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [newRuleCamera, setNewRuleCamera] = useState("cam-vault-entrance");
  const [newRuleName, setNewRuleName] = useState("Vault Perimeter Acoustic Sentinel");
  const [glassSens, setGlassSens] = useState(85);
  const [screamSens, setScreamSens] = useState(75);
  const [gunshotSens, setGunshotSens] = useState(90);
  const [shutterSens, setShutterSens] = useState(80);
  const [blindSpotAutoPtz, setBlindSpotAutoPtz] = useState(true);
  const [savingRule, setSavingRule] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [rulesRes, blindSpotsRes, eventsRes, statsRes] = await Promise.all([
        acousticAiApi.listRules(),
        acousticAiApi.listBlindSpots(),
        acousticAiApi.listEvents({
          signature: selectedSignatureFilter !== 'all' ? selectedSignatureFilter : undefined,
          blindSpotOnly: blindSpotOnlyFilter || undefined,
          limit: 50,
        }),
        acousticAiApi.getFleetStats(),
      ]);

      if (rulesRes?.data) setRules(rulesRes.data);
      if (blindSpotsRes?.data) setBlindSpots(blindSpotsRes.data);
      if (eventsRes?.data) setEvents(eventsRes.data);
      if (statsRes?.data) setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load Acoustic AI workspace data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSignatureFilter, blindSpotOnlyFilter]);

  const handleSimulate = async (sig?: typeof simSignature) => {
    try {
      setSimulating(true);
      const targetSig = sig || simSignature;
      const res = await acousticAiApi.simulateEvent({
        cameraId: simCameraId,
        branchId: simBranchId,
        signature: targetSig,
        visualTargetInFov: !simIsBlindSpot,
        azimuthDeg: simIsBlindSpot ? 180 : 0,
      });

      if (res?.data) {
        setSimulationResult(res.data);
        // Prepend new event
        setEvents(prev => [res.data.event, ...prev.filter(e => e.id !== res.data.event.id)]);
        // Play synthetic web audio tone preview
        playWebAudioTone(targetSig);
      }
    } catch (err) {
      console.error("Simulation error", err);
    } finally {
      setSimulating(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      const res = await acousticAiApi.acknowledgeEvent(id, "Acknowledged by Central Command Operator");
      if (res?.data) {
        setEvents(prev => prev.map(e => (e.id === id ? res.data : e)));
      }
    } catch (err) {
      console.error("Failed to acknowledge event", err);
    }
  };

  const handleSaveRule = async () => {
    try {
      setSavingRule(true);
      const res = await acousticAiApi.createRule({
        cameraId: newRuleCamera,
        name: newRuleName,
        glass_sensitivity: glassSens / 100,
        scream_sensitivity: screamSens / 100,
        gunshot_sensitivity: gunshotSens / 100,
        shutter_sensitivity: shutterSens / 100,
        blind_spot_auto_ptz: blindSpotAutoPtz,
        enabled_signatures: ['glass_break', 'screaming_aggression', 'gunshot_blast', 'shutter_tamper_breach'],
      });
      if (res?.data) {
        setRules(prev => [res.data, ...prev]);
        setShowRuleModal(false);
      }
    } catch (err) {
      console.error("Failed to create rule", err);
    } finally {
      setSavingRule(false);
    }
  };

  const playWebAudioTone = (signature: string) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      setPlayingSignature(signature);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (signature === 'glass_break') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(4800, now);
        osc.frequency.exponentialRampToValueAtTime(6200, now + 0.05);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (signature === 'gunshot_blast') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (signature === 'shutter_tamper_breach') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1440, now + 0.04);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (signature === 'screaming_aggression') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.linearRampToValueAtTime(1600, now + 0.2);
        osc.frequency.linearRampToValueAtTime(900, now + 0.5);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }

      setTimeout(() => setPlayingSignature(null), 600);
    } catch (e) {
      setPlayingSignature(null);
    }
  };

  const getSignatureMeta = (sig: string) => {
    switch (sig) {
      case 'glass_break':
        return {
          title: "Glass Breaking (ഗ്ലാസ് പൊട്ടുന്ന ശബ്ദം)",
          short: "Glass Break",
          icon: "🪟",
          color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
          dsp: "High Freq > 3.8 kHz | ZCR > 0.25 | Shatter Envelope",
        };
      case 'screaming_aggression':
        return {
          title: "Screaming / Aggression (അലർച്ച / നിലവിളി)",
          short: "Distress Scream",
          icon: "🗣️",
          color: "text-rose-400 bg-rose-500/10 border-rose-500/30",
          dsp: "Vocal Formants 1.2-3.2 kHz | High SPL | Vocal Jitter",
        };
      case 'gunshot_blast':
        return {
          title: "Gunshot / Explosive Blast (വെടിശബ്ദം)",
          short: "Gunshot Blast",
          icon: "💥",
          color: "text-red-500 bg-red-600/15 border-red-500/40",
          dsp: "N-Wave Rise < 4ms | Crest Factor > 16.5 dB | Extreme Peak",
        };
      case 'shutter_tamper_breach':
        return {
          title: "Shutter Tamper / Structural Breach (ഷട്ടർ തകർക്കുന്ന ശബ്ദം)",
          short: "Shutter Breach",
          icon: "🚪",
          color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
          dsp: "Metallic Ring 880-1440 Hz | Impact Strike | Structural Ringing",
        };
      default:
        return {
          title: "Acoustic Spike",
          short: "Acoustic Spike",
          icon: "⚡",
          color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
          dsp: "High Transient Rise | Elevated SNR",
        };
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
              <Mic className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Acoustic AI (Audio Anomaly Detection)
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active 24/7 DSP
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                ക്യാമറയുടെ വിഷ്വൽ റേഞ്ചിന് പുറത്തുള്ള സംഭവങ്ങൾ ഓഡിയോ വഴി തിരിച്ചറിയൽ (Blind-Spot Acoustic Intelligence)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRuleModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Sliders className="h-4 w-4" />
            Sensitivity Rules
          </button>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>24h Anomaly Detections</span>
            <Activity className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {stats?.totalEvents24h ?? 28}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Real-time edge acoustic events</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active P1 Threats</span>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-red-400">
            {stats?.activeThreatCount ?? 4}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Gunshots, glass breaks & breaches</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Blind-Spot Detections</span>
            <EyeOff className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-300">
            {stats?.blindSpotEventCount ?? 19}
          </div>
          <div className="text-[11px] text-amber-400/80 mt-1">Outside active camera FOV</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Automated PTZ Slews</span>
            <RotateCw className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-cyan-400">
            {stats?.ptzSlewCommandsTriggered ?? 15}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Camera auto-aimed to sector</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Fleet Noise Floor</span>
            <Volume2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">
            {stats?.averageNoiseFloorDbFS?.toFixed(1) ?? "-64.5"} dBFS
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Calibrated ambient acoustic floor</div>
        </div>
      </div>

      {/* 4 Core Acoustic Capabilities Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            4 Core Security Acoustic Signatures (സവിശേഷതകൾ)
          </h2>
          <span className="text-xs text-slate-400">Click any card to test instant simulation</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 1. Glass Break */}
          <div
            onClick={() => handleSimulate('glass_break')}
            className="cursor-pointer group bg-gradient-to-b from-slate-900 to-slate-900/70 border border-amber-500/20 hover:border-amber-500/50 rounded-xl p-4 transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/10"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">🪟</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                P1 Threat
              </span>
            </div>
            <h3 className="text-sm font-bold text-white mt-3 group-hover:text-amber-300 transition-colors">
              Glass Breaking Detection
            </h3>
            <p className="text-xs text-amber-200/70 font-medium">ഗ്ലാസ് പൊട്ടുന്ന ശബ്ദം</p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Window, showcase, or glass door shattering detected via high-frequency resonance (3.8 - 6.5 kHz) & brittle fracture envelope.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Test Simulation</span>
              <Play className="h-3.5 w-3.5 text-amber-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 2. Screaming */}
          <div
            onClick={() => handleSimulate('screaming_aggression')}
            className="cursor-pointer group bg-gradient-to-b from-slate-900 to-slate-900/70 border border-rose-500/20 hover:border-rose-500/50 rounded-xl p-4 transition-all duration-200 hover:shadow-lg hover:shadow-rose-500/10"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">🗣️</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                P1 Threat
              </span>
            </div>
            <h3 className="text-sm font-bold text-white mt-3 group-hover:text-rose-300 transition-colors">
              Screaming & Aggression
            </h3>
            <p className="text-xs text-rose-200/70 font-medium">അലർച്ച / നിലവിളി</p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Human vocal distress, terror screaming, or bank counter hostility isolated via vocal tract formant resonance (1.2 - 3.2 kHz).
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Test Simulation</span>
              <Play className="h-3.5 w-3.5 text-rose-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 3. Gunshot / Blast */}
          <div
            onClick={() => handleSimulate('gunshot_blast')}
            className="cursor-pointer group bg-gradient-to-b from-slate-900 to-slate-900/70 border border-red-500/25 hover:border-red-500/60 rounded-xl p-4 transition-all duration-200 hover:shadow-lg hover:shadow-red-500/10"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">💥</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-red-600/30 text-red-300 border border-red-500/40">
                P1 Critical
              </span>
            </div>
            <h3 className="text-sm font-bold text-white mt-3 group-hover:text-red-300 transition-colors">
              Gunshot / Explosive Blast
            </h3>
            <p className="text-xs text-red-300/80 font-medium">വെടിശബ്ദം / സ്ഫോടനം</p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Supersonic muzzle shockwave N-wave detected via sub-4ms attack rise time, extreme crest factor (&gt;16.5 dB) and reverberation decay.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Test Simulation</span>
              <Play className="h-3.5 w-3.5 text-red-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 4. Shutter Tamper / Metal Breach */}
          <div
            onClick={() => handleSimulate('shutter_tamper_breach')}
            className="cursor-pointer group bg-gradient-to-b from-slate-900 to-slate-900/70 border border-cyan-500/20 hover:border-cyan-500/50 rounded-xl p-4 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-500/10"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">🚪</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                P1 Threat
              </span>
            </div>
            <h3 className="text-sm font-bold text-white mt-3 group-hover:text-cyan-300 transition-colors">
              Shutter Tamper & Breach
            </h3>
            <p className="text-xs text-cyan-200/70 font-medium">ഷട്ടർ തകർക്കുന്ന ശബ്ദം</p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Sledgehammer, crowbar prying, or metal rolling shutter forced intrusion identified by 880-1440 Hz metallic resonance ringing.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Test Simulation</span>
              <Play className="h-3.5 w-3.5 text-cyan-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Blind-Spot Spatial Correlation & PTZ Slew Visualizer Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Blind Spot Intelligence Diagram & Simulator */}
        <div className="lg:col-span-1 bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Compass className="h-4 w-4 text-cyan-400" />
              Blind-Spot PTZ Slew Correlator
            </h3>
            <span className="text-[11px] text-cyan-400 font-mono">360° Acoustic Arc</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            ക്യാമറയ്ക്ക് ബ്ലൈൻഡ് സ്പോട്ടിൽ (പിന്നിലോ മതിലിന് അപ്പുറത്തോ) നടക്കുന്ന ശബ്ദങ്ങൾ തിരിച്ചറിഞ്ഞ് സമീപത്തെ PTZ ക്യാമറ അങ്ങോട്ട് തിരിക്കുന്നു.
          </p>

          {/* Interactive Radar / FOV Visualizer Graphic */}
          <div className="relative aspect-square max-w-[280px] mx-auto rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center p-4 overflow-hidden">
            {/* Visual FOV Sector (0 - 90 deg forward) */}
            <div
              className="absolute inset-0 bg-emerald-500/10 border-b border-emerald-500/30"
              style={{
                clipPath: "polygon(50% 50%, 15% 0%, 85% 0%)",
              }}
            />
            {/* Blind Spot Zone (Rear 180 deg) */}
            <div
              className={`absolute inset-0 transition-colors duration-500 ${
                simulationResult?.blindSpotResult?.isBlindSpot
                  ? "bg-red-500/20 border-t border-red-500/50"
                  : "bg-amber-500/5 border-t border-dashed border-amber-500/20"
              }`}
              style={{
                clipPath: "polygon(50% 50%, 0% 80%, 100% 80%, 100% 100%, 0% 100%)",
              }}
            />

            {/* Concentric distance rings */}
            <div className="absolute w-3/4 h-3/4 rounded-full border border-slate-800/80 pointer-events-none" />
            <div className="absolute w-1/2 h-1/2 rounded-full border border-slate-800/80 pointer-events-none" />

            {/* Center Fixed Camera Icon */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="p-2 rounded-full bg-slate-900 border border-slate-700 shadow-md">
                <Camera className="h-4 w-4 text-emerald-400" />
              </div>
              <span className="text-[9px] text-slate-400 mt-1 font-mono font-bold">FOV: 90°</span>
            </div>

            {/* Rear Acoustic Incident Ping */}
            <div
              className={`absolute bottom-6 z-20 flex flex-col items-center transition-transform duration-300 ${
                simulationResult?.blindSpotResult?.isBlindSpot ? "scale-110" : ""
              }`}
            >
              <div className="relative flex items-center justify-center">
                <span className="h-4 w-4 rounded-full bg-red-500 animate-ping absolute" />
                <span className="h-3 w-3 rounded-full bg-red-500 relative" />
              </div>
              <span className="text-[9px] text-red-400 font-bold mt-1 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-800/60">
                180° Blind Spot
              </span>
            </div>

            {/* PTZ Arrow Indicator */}
            {simulationResult?.blindSpotResult?.ptzSlewTriggered && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none animate-spin" style={{ animationDuration: '6s' }}>
                <div className="w-24 h-0.5 bg-gradient-to-r from-transparent to-cyan-400 relative">
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400" />
                </div>
              </div>
            )}
          </div>

          <div className="text-xs space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-400">Target PTZ Camera:</span>
              <span className="font-mono text-cyan-400 font-semibold">cam-ptz-courtyard</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-400">Preset Recalled:</span>
              <span className="font-mono text-emerald-400 font-semibold">Preset 3 (Back Alley Shutter)</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-400">Spatial Azimuth:</span>
              <span className="font-mono text-amber-400 font-semibold">180° Rear Vector</span>
            </div>
          </div>
        </div>

        {/* Right 2 cols: Live Anomaly Forensic Feed */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BellRing className="h-4 w-4 text-indigo-400" />
                Live Acoustic Incident Forensic Ledger
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Real-time alerts with spectral metrics and blind-spot tags</p>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedSignatureFilter}
                onChange={e => setSelectedSignatureFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Acoustic Signatures</option>
                <option value="glass_break">Glass Breaking</option>
                <option value="screaming_aggression">Screaming / Distress</option>
                <option value="gunshot_blast">Gunshot / Blast</option>
                <option value="shutter_tamper_breach">Shutter Tamper</option>
              </select>

              <button
                onClick={() => setBlindSpotOnlyFilter(!blindSpotOnlyFilter)}
                className={`text-xs px-2.5 py-1.5 rounded border transition-colors flex items-center gap-1.5 ${
                  blindSpotOnlyFilter
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                <EyeOff className="h-3.5 w-3.5" />
                Blind Spot Only
              </button>
            </div>
          </div>

          {/* Event Stream */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No acoustic anomaly incidents detected matching current filters.
              </div>
            ) : (
              events.map(event => {
                const meta = getSignatureMeta(event.signature);
                const isAck = event.status === 'acknowledged';

                return (
                  <div
                    key={event.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isAck
                        ? "bg-slate-950/40 border-slate-800/60 opacity-80"
                        : "bg-slate-950/90 border-slate-800 hover:border-slate-700 shadow-md"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{meta.icon}</span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-white">
                              {meta.title}
                            </span>
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${meta.color}`}>
                              {event.severity}
                            </span>
                            {event.is_blind_spot && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                <EyeOff className="h-3 w-3" />
                                Camera Blind Spot
                              </span>
                            )}
                            {event.ptz_slew_triggered && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                                <RotateCw className="h-3 w-3" />
                                PTZ Slew Triggered
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                            <span>Camera: <span className="font-mono text-slate-300">{event.camera_id}</span></span>
                            <span>•</span>
                            <span>Confidence: <span className="font-semibold text-emerald-400">{(event.confidence * 100).toFixed(0)}%</span></span>
                            <span>•</span>
                            <span>{new Date(event.detected_at).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => playWebAudioTone(event.signature)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Play Audio Waveform Simulation"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                        {!isAck ? (
                          <button
                            onClick={() => handleAcknowledge(event.id)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Acknowledge
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" />
                            Acknowledged
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Waveform Envelope & Forensic DSP Details */}
                    <div className="mt-3 pt-3 border-t border-slate-900 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-900/40 p-2.5 rounded-lg">
                      <div>
                        <span className="text-slate-500 text-[11px]">Peak Level:</span>
                        <div className="font-mono text-slate-200 font-semibold">{event.peak_dbfs.toFixed(1)} dBFS</div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Crest Factor:</span>
                        <div className="font-mono text-slate-200 font-semibold">{event.crest_factor_db.toFixed(1)} dB</div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Spectral Centroid:</span>
                        <div className="font-mono text-slate-200 font-semibold">{event.spectral_centroid_hz.toFixed(0)} Hz</div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Attack Rise Time:</span>
                        <div className="font-mono text-slate-200 font-semibold">{event.attack_time_ms.toFixed(1)} ms</div>
                      </div>
                    </div>

                    {event.details?.blindSpotReason && (
                      <div className="mt-2 text-xs text-amber-300/80 bg-amber-500/5 px-2.5 py-1.5 rounded border border-amber-500/20">
                        {event.details.blindSpotReason}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Sensitivity Rules Configuration Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Sliders className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Camera Acoustic Sensitivity Rule</h3>
              </div>
              <button
                onClick={() => setShowRuleModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-medium">Camera ID / Stream</label>
                <input
                  type="text"
                  value={newRuleCamera}
                  onChange={e => setNewRuleCamera(e.target.value)}
                  className="w-full mt-1.5 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium">Rule Policy Name</label>
                <input
                  type="text"
                  value={newRuleName}
                  onChange={e => setNewRuleName(e.target.value)}
                  className="w-full mt-1.5 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"
                />
              </div>

              {/* Sliders */}
              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-slate-300">
                    <span>🪟 Glass Breaking Sensitivity</span>
                    <span className="font-mono text-amber-400 font-bold">{glassSens}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={glassSens}
                    onChange={e => setGlassSens(Number(e.target.value))}
                    className="w-full mt-1 accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300">
                    <span>🗣️ Screaming & Distress Sensitivity</span>
                    <span className="font-mono text-rose-400 font-bold">{screamSens}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={screamSens}
                    onChange={e => setScreamSens(Number(e.target.value))}
                    className="w-full mt-1 accent-rose-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300">
                    <span>💥 Gunshot & Blast Sensitivity</span>
                    <span className="font-mono text-red-400 font-bold">{gunshotSens}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={gunshotSens}
                    onChange={e => setGunshotSens(Number(e.target.value))}
                    className="w-full mt-1 accent-red-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300">
                    <span>🚪 Shutter Tamper & Breach Sensitivity</span>
                    <span className="font-mono text-cyan-400 font-bold">{shutterSens}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={shutterSens}
                    onChange={e => setShutterSens(Number(e.target.value))}
                    className="w-full mt-1 accent-cyan-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={blindSpotAutoPtz}
                    onChange={e => setBlindSpotAutoPtz(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span>Enable Automated Blind-Spot PTZ Slew & Preset Recall</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowRuleModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRule}
                disabled={savingRule}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
              >
                {savingRule ? "Saving Rule..." : "Save Acoustic Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
