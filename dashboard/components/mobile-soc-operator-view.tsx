"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon,
  ShieldAlert,
  PhoneCall,
  Video,
  CheckCircle2,
  AlertTriangle,
  Play,
  Clock,
  Building2,
  ChevronRight,
  RefreshCw,
  Send,
} from "lucide-react";

export function MobileSocOperatorView() {
  const [activeAlert, setActiveAlert] = useState<{
    id: string;
    title: string;
    severity: "P1" | "P2";
    branchName: string;
    branchId: string;
    cameraName: string;
    cameraId: string;
    managerPhone: string;
    snapshotUrl: string;
    occurredAt: string;
    acknowledged: boolean;
    remainingSeconds: number;
  }>({
    id: "inc-mobile-001",
    title: "P1 Vault Motion Breach",
    severity: "P1",
    branchName: "Branch 034 - MG Road, Kochi",
    branchId: "BR-034",
    cameraName: "Vault Door Primary (CAM-301-17)",
    cameraId: "cam-301-17",
    managerPhone: "+919876543210",
    snapshotUrl: "/assets/sample_vault_snapshot.jpg",
    occurredAt: new Date().toISOString(),
    acknowledged: false,
    remainingSeconds: 45,
  });

  const [notes, setNotes] = useState("");
  const [actionDone, setActionDone] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveAlert((prev) => ({
        ...prev,
        remainingSeconds: Math.max(0, prev.remainingSeconds - 1),
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAcknowledge = () => {
    setActiveAlert((prev) => ({ ...prev, acknowledged: true }));
  };

  const handleTakeAction = (action: string) => {
    setActionDone(action);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-950 text-white p-4 space-y-4 font-sans pb-12">
      {/* 1. Mobile App Top Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          <span className="font-bold text-base tracking-tight">Sentinel SOC Mobile</span>
        </div>
        <Badge variant="outline" className="border-red-600 text-red-400 bg-red-950/40 text-xs font-mono">
          P1 PRIORITY
        </Badge>
      </div>

      {/* 2. Emergency Alert Card */}
      <Card className="bg-slate-900 border-red-800/80 shadow-2xl overflow-hidden">
        <div className="bg-red-950/90 border-b border-red-800 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="animate-ping w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs font-bold text-red-200">SLA TIMEOUT: {activeAlert.remainingSeconds}s</span>
          </div>
          <span className="text-[10px] font-mono text-red-300">#{activeAlert.id}</span>
        </div>

        <CardContent className="p-4 space-y-3">
          <div>
            <h2 className="text-lg font-bold text-white leading-snug">{activeAlert.title}</h2>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-3.5 h-3.5 text-slate-500" /> {activeAlert.branchName}
            </p>
            <p className="text-xs text-blue-400 font-mono mt-0.5">{activeAlert.cameraName}</p>
          </div>

          {/* Snapshot Container */}
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
            <div className="text-center p-4">
              <Video className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <span className="text-xs text-slate-400 font-mono">LIVE PRE-ALARM EVIDENCE CLIP</span>
            </div>
            <div className="absolute top-2 right-2 bg-red-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded">
              REC -15s / +30s
            </div>
          </div>

          {/* Quick Action Dial / Manager Connect */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <a
              href={`tel:${activeAlert.managerPhone}`}
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2.5 px-3 rounded-lg border border-slate-700 transition-colors"
            >
              <PhoneCall className="w-4 h-4 text-emerald-400" /> Call Manager
            </a>

            {!activeAlert.acknowledged ? (
              <Button
                onClick={handleAcknowledge}
                className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2.5"
              >
                Acknowledge SLA
              </Button>
            ) : (
              <Button
                disabled
                className="bg-emerald-900/60 text-emerald-300 border border-emerald-700 text-xs font-semibold"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Acknowledged
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Mobile Incident Quick Decisions */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Mobile Field Decision
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-2">
          {actionDone ? (
            <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 p-3 rounded-lg text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              Action recorded: {actionDone}. Transmitted to Central SOC.
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={() => handleTakeAction("DISPATCH_QRT_POLICE")}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 flex justify-between"
              >
                <span>🚨 Confirm Intrusion (Dispatch QRT)</span>
                <ChevronRight className="w-4 h-4" />
              </Button>

              <Button
                onClick={() => handleTakeAction("AUTHORIZED_KEYHOLDER")}
                variant="outline"
                className="w-full border-slate-700 hover:bg-slate-800 text-slate-200 text-xs py-2.5 flex justify-between"
              >
                <span>✅ Authorized Activity (Keyholder Confirmed)</span>
                <ChevronRight className="w-4 h-4" />
              </Button>

              <Button
                onClick={() => handleTakeAction("FALSE_ALARM_WEATHER")}
                variant="outline"
                className="w-full border-slate-700 hover:bg-slate-800 text-slate-400 text-xs py-2.5 flex justify-between"
              >
                <span>⚠️ False Alarm (Reflection / Insect)</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Branch Health Mini Summary */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
        <p className="font-semibold text-slate-300">Branch 034 Health Status</p>
        <div className="flex justify-between text-slate-400">
          <span>Internet Connectivity</span>
          <span className="text-emerald-400 font-mono font-semibold">Primary Fiber (Active)</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>NVR Recorders</span>
          <span className="text-emerald-400 font-mono font-semibold">1/1 Online (100% OK)</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Cameras</span>
          <span className="text-amber-400 font-mono font-semibold">19/20 Online (1 Offline)</span>
        </div>
      </div>
    </div>
  );
}
