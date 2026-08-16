"use client";

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  PowerOff,
  Wrench,
  Clock,
  HelpCircle,
} from "lucide-react";

export type StatusType =
  | "HEALTHY"
  | "ONLINE"
  | "WARNING"
  | "CRITICAL"
  | "OFFLINE"
  | "MAINTENANCE"
  | "MAINTENANCE_RECOVERY"
  | "STALE"
  | "UNKNOWN"
  | "P1"
  | "P2"
  | "P3"
  | "P4";

interface StatusBadgeProps {
  status: StatusType | string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  label?: string;
  className?: string;
}

export function StatusBadge({
  status,
  size = "md",
  showIcon = true,
  label,
  className = "",
}: StatusBadgeProps) {
  const normStatus = (status || "UNKNOWN").toUpperCase();

  let bgClass = "bg-slate-800/60 text-slate-300 border-slate-700/60";
  let IconComponent = HelpCircle;
  let defaultLabel = normStatus;

  switch (normStatus) {
    case "HEALTHY":
    case "ONLINE":
      bgClass = "bg-emerald-950/40 text-emerald-300 border-emerald-800/40";
      IconComponent = CheckCircle2;
      defaultLabel = "Healthy";
      break;
    case "WARNING":
    case "P2":
      bgClass = "bg-amber-950/40 text-amber-300 border-amber-800/40";
      IconComponent = AlertTriangle;
      defaultLabel = normStatus === "P2" ? "P2 High" : "Warning";
      break;
    case "CRITICAL":
    case "P1":
      bgClass = "bg-rose-950/50 text-rose-300 border-rose-800/50";
      IconComponent = AlertOctagon;
      defaultLabel = normStatus === "P1" ? "P1 Critical" : "Critical";
      break;
    case "OFFLINE":
      bgClass = "bg-zinc-900/60 text-zinc-400 border-zinc-700/50";
      IconComponent = PowerOff;
      defaultLabel = "Offline";
      break;
    case "MAINTENANCE":
    case "MAINTENANCE_RECOVERY":
      bgClass = "bg-blue-950/40 text-blue-300 border-blue-800/40";
      IconComponent = Wrench;
      defaultLabel = normStatus === "MAINTENANCE_RECOVERY" ? "Maint. Grace" : "Maintenance";
      break;
    case "STALE":
      bgClass = "bg-yellow-950/40 text-yellow-300 border-yellow-800/40";
      IconComponent = Clock;
      defaultLabel = "Stale Data";
      break;
    case "UNKNOWN":
    default:
      bgClass = "bg-slate-900/60 text-slate-400 border-slate-700/50";
      IconComponent = HelpCircle;
      defaultLabel = "Unknown";
      break;
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5 font-medium",
    lg: "px-3 py-1.5 text-sm gap-2 font-medium",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border transition-colors ${bgClass} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && <IconComponent className={iconSizes[size]} />}
      <span>{label || defaultLabel}</span>
    </span>
  );
}
