"use client";

import React, { useState } from "react";
import {
  Home as HomeIcon,
  Video,
  Play,
  Bell,
  Shield,
  ShieldAlert,
  Plus,
  Users,
  Settings,
  Mic,
  Volume2,
  Camera,
  Maximize2,
  RefreshCw,
  Wifi,
  Search,
  CheckCircle2,
  QrCode,
  Share2
} from "lucide-react";

interface CameraItem {
  id: string;
  name: string;
  room: string;
  type: "WIFI" | "NVR_IP";
  brand: string;
  status: "ONLINE" | "OFFLINE";
  lastEvent?: string;
  streamUrl: string;
}

const INITIAL_CAMERAS: CameraItem[] = [
  {
    id: "cam-1",
    name: "Front Gate Camera",
    room: "Front Gate",
    type: "NVR_IP",
    brand: "CP Plus / Hikvision",
    status: "ONLINE",
    lastEvent: "Person detected 8m ago",
    streamUrl: "/api/streams/cam-1"
  },
  {
    id: "cam-2",
    name: "Living Room Cam",
    room: "Living Room",
    type: "WIFI",
    brand: "Smart Wi-Fi (Trueview)",
    status: "ONLINE",
    lastEvent: "Motion detected 25m ago",
    streamUrl: "/api/streams/cam-2"
  },
  {
    id: "cam-3",
    name: "Backyard Garden",
    room: "Backyard",
    type: "NVR_IP",
    brand: "Dahua IP",
    status: "ONLINE",
    lastEvent: "Motion detected 1h ago",
    streamUrl: "/api/streams/cam-3"
  },
  {
    id: "cam-4",
    name: "Balcony / Porch",
    room: "Porch",
    type: "WIFI",
    brand: "Smart Wi-Fi (Tapo)",
    status: "ONLINE",
    lastEvent: "All clear",
    streamUrl: "/api/streams/cam-4"
  }
];

export default function HomeAppPage() {
  const [securityMode, setSecurityMode] = useState<"HOME" | "AWAY" | "SLEEP">("HOME");
  const [cameras, setCameras] = useState<CameraItem[]>(INITIAL_CAMERAS);
  const [activeTab, setActiveTab] = useState<"LIVE" | "PLAYBACK" | "ALERTS" | "FAMILY">("LIVE");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<string[]>([]);

  const handleScanNetwork = () => {
    setIsScanning(true);
    setDiscoveredDevices([]);
    setTimeout(() => {
      setIsScanning(false);
      setDiscoveredDevices([
        "Hikvision DS-2CD2043 (192.168.1.105:554) - RTSP Ready",
        "CP Plus CP-UNC-T41PL3 (192.168.1.112:554) - ONVIF Ready",
        "Dahua NVR 4-Channel (192.168.1.200:37777)"
      ]);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <HomeIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-white">My Home</h1>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 font-medium px-2 py-0.5 rounded-full border border-emerald-500/30">
                Armed ({securityMode})
              </span>
            </div>
            <p className="text-xs text-slate-400">4 Cameras Online • 1 Edge Gateway Active</p>
          </div>
        </div>

        {/* Security Arm Mode Selector */}
        <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-xl border border-slate-700">
          <button
            onClick={() => setSecurityMode("HOME")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              securityMode === "HOME" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Home
          </button>
          <button
            onClick={() => setSecurityMode("AWAY")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              securityMode === "AWAY" ? "bg-rose-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Away
          </button>
          <button
            onClick={() => setSecurityMode("SLEEP")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              securityMode === "SLEEP" ? "bg-amber-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Sleep
          </button>
        </div>

        {/* Add Camera Button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add Camera</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("LIVE")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === "LIVE" ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-900"
            }`}
          >
            <Video className="w-4 h-4" /> Live View
          </button>
          <button
            onClick={() => setActiveTab("PLAYBACK")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === "PLAYBACK" ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-900"
            }`}
          >
            <Play className="w-4 h-4" /> Timeline Playback
          </button>
          <button
            onClick={() => setActiveTab("ALERTS")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === "ALERTS" ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-900"
            }`}
          >
            <Bell className="w-4 h-4" /> Activity Feed
          </button>
          <button
            onClick={() => setActiveTab("FAMILY")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === "FAMILY" ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-900"
            }`}
          >
            <Users className="w-4 h-4" /> Family Sharing
          </button>
        </div>

        {/* Live Grid */}
        {activeTab === "LIVE" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cameras.map((cam) => (
              <div
                key={cam.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl hover:border-slate-700 transition flex flex-col"
              >
                {/* Camera Top Bar */}
                <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <h3 className="font-semibold text-sm text-white">{cam.name}</h3>
                      <p className="text-[11px] text-slate-400">{cam.room} • {cam.brand}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {cam.type === "WIFI" ? "Wi-Fi Cloud" : "NVR Local Edge"}
                  </span>
                </div>

                {/* Video Container Simulator */}
                <div className="relative aspect-video bg-black flex items-center justify-center group overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />
                  
                  {/* Mock Camera View */}
                  <div className="text-center text-slate-500 space-y-2">
                    <Video className="w-10 h-10 mx-auto opacity-40 text-indigo-400" />
                    <p className="text-xs font-mono text-slate-400 tracking-wider">LIVE 1080P • 25 FPS • 1.8 Mbps</p>
                  </div>

                  {/* On-Screen Badges */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                      LIVE
                    </span>
                    <span className="bg-slate-900/80 backdrop-blur text-slate-300 text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
                      <Wifi className="w-3 h-3 text-emerald-400" /> Good
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-3 text-[11px] text-slate-200 bg-slate-950/70 px-2 py-0.5 rounded">
                    {cam.lastEvent}
                  </div>

                  {/* Overlay Quick Controls */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-90 group-hover:opacity-100 transition">
                    <button title="2-Way Audio" className="p-2 rounded-xl bg-slate-900/80 hover:bg-indigo-600 text-white backdrop-blur transition">
                      <Mic className="w-4 h-4" />
                    </button>
                    <button title="Take Snapshot" className="p-2 rounded-xl bg-slate-900/80 hover:bg-indigo-600 text-white backdrop-blur transition">
                      <Camera className="w-4 h-4" />
                    </button>
                    <button title="Fullscreen" className="p-2 rounded-xl bg-slate-900/80 hover:bg-indigo-600 text-white backdrop-blur transition">
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline Playback Tab */}
        {activeTab === "PLAYBACK" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
            <h3 className="text-base font-semibold text-white">24-Hour Home Playback Timeline</h3>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              Scrub backwards through 24-hour cloud and local SD-card storage. Green markers represent smart motion and human detection events.
            </p>
            <div className="w-full bg-slate-950 h-16 rounded-xl border border-slate-800 flex items-center justify-between px-4 text-xs font-mono text-slate-400">
              <span>00:00</span>
              <span className="h-6 w-1 bg-emerald-500 rounded" title="Motion Event 06:15" />
              <span>06:00</span>
              <span className="h-8 w-1 bg-rose-500 rounded" title="Human Event 11:20" />
              <span className="text-white font-bold bg-indigo-600 px-2 py-1 rounded">12:20 NOW</span>
              <span>18:00</span>
              <span>23:59</span>
            </div>
          </div>
        )}

        {/* Family Sharing Tab */}
        {activeTab === "FAMILY" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Family Members & Access</h3>
                <p className="text-sm text-slate-400">Share your home cameras with spouse, parents, or family members.</p>
              </div>
              <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold">
                <Share2 className="w-3.5 h-3.5" /> Invite Member
              </button>
            </div>
            <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Dhanya (You)</p>
                  <p className="text-xs text-slate-400">Owner • Full Access (Live, Playback, Settings)</p>
                </div>
                <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-full font-medium">Owner</span>
              </div>
              <div className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Family Member</p>
                  <p className="text-xs text-slate-400">family@home.local • Live View & Playback Only</p>
                </div>
                <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full font-medium">Family</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add Camera Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" /> Add New Camera
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl hover:border-indigo-500 cursor-pointer transition">
                <QrCode className="w-6 h-6 text-indigo-400 mb-2" />
                <h4 className="font-semibold text-sm text-white">Wi-Fi Smart Cam</h4>
                <p className="text-xs text-slate-400 mt-1">Scan QR code on Trueview, Tapo, or Tuya camera</p>
              </div>

              <div
                onClick={handleScanNetwork}
                className="p-4 bg-slate-950 border border-slate-800 rounded-xl hover:border-indigo-500 cursor-pointer transition"
              >
                <Search className="w-6 h-6 text-indigo-400 mb-2" />
                <h4 className="font-semibold text-sm text-white">Auto-Scan Wi-Fi</h4>
                <p className="text-xs text-slate-400 mt-1">Detect CP Plus, Hikvision & Dahua IP/NVR</p>
              </div>
            </div>

            {/* Network Scan Results */}
            {isScanning && (
              <div className="p-4 bg-slate-950 rounded-xl text-center space-y-2 border border-slate-800">
                <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-300">Scanning local home network for ONVIF and RTSP devices...</p>
              </div>
            )}

            {discoveredDevices.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Found Devices:</h4>
                {discoveredDevices.map((dev, idx) => (
                  <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-slate-200">{dev}</span>
                    <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded font-semibold">
                      Pair
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
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
