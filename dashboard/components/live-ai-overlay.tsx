"use client";

import React, { useId, useMemo } from "react";
import type { AnalyticsAlert, AnalyticsRule } from "@/lib/types";

export interface BoundingBox {
  x: number;      // 0..100 percentage
  y: number;      // 0..100 percentage
  width: number;  // 0..100 percentage
  height: number; // 0..100 percentage
  label: string;
  confidence: number;
  isViolation?: boolean;
  trackId?: string;
}

export interface LiveAiOverlayProps {
  rules?: AnalyticsRule[];
  alerts?: AnalyticsAlert[];
  cameraName?: string;
  showHeatmap?: boolean;
}

export function LiveAiOverlay({
  rules = [],
  alerts = [],
  cameraName = "",
  showHeatmap = true,
}: LiveAiOverlayProps) {
  const filterId = useId();

  // Normalize points to 0..100 percentage
  const normalizePoints = (points: Array<{ x: number; y: number }>) => {
    return points.map((p) => {
      // If coordinates are normalized 0..1
      const x = p.x <= 1 ? p.x * 100 : p.x <= 100 ? p.x : (p.x / 1920) * 100;
      const y = p.y <= 1 ? p.y * 100 : p.y <= 100 ? p.y : (p.y / 1080) * 100;
      return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    });
  };

  // 1. Process Virtual Tripwires & Geofence Security Zones
  const zonesAndTripwires = useMemo(() => {
    const activeAlertRuleIds = new Set(alerts.map((a) => a.ruleId).filter(Boolean));
    const activeAlertTitles = alerts.map((a) => a.title.toLowerCase());

    return rules
      .filter((rule) => rule.enabled && rule.zone && rule.zone.points && rule.zone.points.length >= 2)
      .map((rule) => {
        const zone = rule.zone!;
        const normalized = normalizePoints(zone.points);
        const pointsString = normalized.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

        // Determine breach status
        const isBreached =
          activeAlertRuleIds.has(rule.id) ||
          activeAlertTitles.some((t) => t.includes(rule.name.toLowerCase()) || t.includes("intrusion") || t.includes("zone") || t.includes("perimeter"));

        // Compute centroid for badge
        const avgX = normalized.reduce((acc, p) => acc + p.x, 0) / normalized.length;
        const avgY = normalized.reduce((acc, p) => acc + p.y, 0) / normalized.length;

        return {
          id: rule.id,
          name: rule.name || zone.name || "Restricted Area",
          shape: zone.shape,
          points: normalized,
          pointsString,
          isBreached,
          centroid: { x: avgX, y: avgY },
          detectionType: rule.detectionType,
        };
      });
  }, [rules, alerts]);

  // 2. Process Real-Time AI Bounding Boxes (Person, Vehicle, No Helmet, Safety Vest)
  const boundingBoxes = useMemo<BoundingBox[]>(() => {
    const boxes: BoundingBox[] = [];

    alerts.forEach((alert, alertIdx) => {
      const isCriticalOrHigh = alert.severity === "P1" || alert.severity === "P2";
      const titleLower = alert.title.toLowerCase();
      const objectClasses = alert.objectClasses && alert.objectClasses.length > 0
        ? alert.objectClasses
        : [alert.title];

      const rawAlert = alert as any;

      // If alert has explicit boundingBoxes array
      if (Array.isArray(rawAlert.boundingBoxes) && rawAlert.boundingBoxes.length > 0) {
        rawAlert.boundingBoxes.forEach((b: any, bIdx: number) => {
          const x = b.x <= 1 ? b.x * 100 : b.x <= 100 ? b.x : (b.x / 1920) * 100;
          const y = b.y <= 1 ? b.y * 100 : b.y <= 100 ? b.y : (b.y / 1080) * 100;
          const width = b.width <= 1 ? b.width * 100 : b.width <= 100 ? b.width : (b.width / 1920) * 100;
          const height = b.height <= 1 ? b.height * 100 : b.height <= 100 ? b.height : (b.height / 1080) * 100;

          boxes.push({
            x,
            y,
            width,
            height,
            label: (b.label || alert.title).toUpperCase(),
            confidence: b.confidence ?? alert.confidence,
            isViolation: isCriticalOrHigh || titleLower.includes("no") || titleLower.includes("violation") || titleLower.includes("intrusion"),
            trackId: `TRK-${alertIdx}-${bIdx}`,
          });
        });
        return;
      }

      // If alert has single explicit boundingBox
      if (rawAlert.boundingBox && typeof rawAlert.boundingBox.x === "number") {
        const b = rawAlert.boundingBox;
        const x = b.x <= 1 ? b.x * 100 : b.x <= 100 ? b.x : (b.x / 1920) * 100;
        const y = b.y <= 1 ? b.y * 100 : b.y <= 100 ? b.y : (b.y / 1080) * 100;
        const width = b.width <= 1 ? b.width * 100 : b.width <= 100 ? b.width : (b.width / 1920) * 100;
        const height = b.height <= 1 ? b.height * 100 : b.height <= 100 ? b.height : (b.height / 1080) * 100;

        boxes.push({
          x,
          y,
          width,
          height,
          label: alert.title.toUpperCase(),
          confidence: alert.confidence,
          isViolation: isCriticalOrHigh || titleLower.includes("no") || titleLower.includes("violation") || titleLower.includes("intrusion"),
          trackId: `TRK-${alertIdx}`,
        });
        return;
      }

      // When bounding boxes are derived from active AI alert classes (e.g. Helmet, Vest, Intrusion Person, Vehicle)
      // Ground coordinates deterministically from alert event ID or rule zone
      const matchedRule = rules.find((r) => r.id === alert.ruleId);
      let posX = 35 + ((alertIdx * 23) % 40);
      let posY = 25 + ((alertIdx * 17) % 35);
      let boxW = 20;
      let boxH = 45;

      if (matchedRule?.zone?.points && matchedRule.zone.points.length > 0) {
        const norm = normalizePoints(matchedRule.zone.points);
        posX = norm[0].x;
        posY = norm[0].y;
      }

      objectClasses.forEach((cls, clsIdx) => {
        const isHelmet = cls.toLowerCase().includes("helmet");
        const isVest = cls.toLowerCase().includes("vest");
        const isVehicle = cls.toLowerCase().includes("vehicle") || cls.toLowerCase().includes("car") || cls.toLowerCase().includes("truck");

        if (isHelmet) {
          boxes.push({
            x: Math.max(5, Math.min(80, posX + 4)),
            y: Math.max(5, Math.min(80, posY)),
            width: 12,
            height: 14,
            label: titleLower.includes("no") ? "NO HELMET VIOLATION" : "HELMET DETECTED",
            confidence: alert.confidence,
            isViolation: titleLower.includes("no") || isCriticalOrHigh,
            trackId: `PPE-H-${alertIdx}-${clsIdx}`,
          });
        } else if (isVest) {
          boxes.push({
            x: Math.max(5, Math.min(75, posX + 2)),
            y: Math.max(5, Math.min(75, posY + 12)),
            width: 16,
            height: 20,
            label: titleLower.includes("no") ? "NO SAFETY VEST" : "SAFETY VEST",
            confidence: alert.confidence,
            isViolation: titleLower.includes("no") || isCriticalOrHigh,
            trackId: `PPE-V-${alertIdx}-${clsIdx}`,
          });
        } else if (isVehicle) {
          boxes.push({
            x: Math.max(5, Math.min(65, posX - 5)),
            y: Math.max(5, Math.min(65, posY + 10)),
            width: 34,
            height: 28,
            label: "VEHICLE DETECTED",
            confidence: alert.confidence,
            isViolation: isCriticalOrHigh,
            trackId: `VEH-${alertIdx}-${clsIdx}`,
          });
        } else {
          boxes.push({
            x: Math.max(5, Math.min(75, posX)),
            y: Math.max(5, Math.min(50, posY)),
            width: boxW,
            height: boxH,
            label: alert.title.toUpperCase(),
            confidence: alert.confidence,
            isViolation: isCriticalOrHigh || titleLower.includes("intrusion"),
            trackId: `OBJ-${alertIdx}-${clsIdx}`,
          });
        }
      });
    });

    return boxes;
  }, [alerts, rules]);

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        {/* Heatmap blur filter */}
        <filter id={`heatmap-blur-${filterId}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>

        {/* Heatmap radial gradient */}
        <radialGradient id={`heat-radial-${filterId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.75" />
          <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.5" />
          <stop offset="80%" stopColor="#06b6d4" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </radialGradient>

        {/* Tripwire Arrow Marker */}
        <marker
          id={`arrow-${filterId}`}
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
        </marker>
      </defs>

      {/* 1. Spatial Movement Heatmap Trails (if active alerts exist and heatmap enabled) */}
      {showHeatmap && boundingBoxes.length > 0 && (
        <g filter={`url(#heatmap-blur-${filterId})`}>
          {boundingBoxes.map((box, idx) => (
            <circle
              key={`heat-${idx}`}
              cx={box.x + box.width / 2}
              cy={box.y + box.height / 2}
              r={Math.max(8, box.width * 0.7)}
              fill={`url(#heat-radial-${filterId})`}
            />
          ))}
        </g>
      )}

      {/* 2. Virtual Tripwires & Security Geofence Zones */}
      {zonesAndTripwires.map((item) => {
        if (item.shape === "polygon") {
          return (
            <g key={item.id}>
              {/* Shaded polygon zone */}
              <polygon
                points={item.pointsString}
                fill={item.isBreached ? "rgba(239, 68, 68, 0.28)" : "rgba(14, 165, 233, 0.12)"}
                stroke={item.isBreached ? "#ef4444" : "#0284c7"}
                strokeWidth={item.isBreached ? "1.4" : "0.9"}
                strokeDasharray={item.isBreached ? "none" : "2,2"}
                vectorEffect="non-scaling-stroke"
                className={item.isBreached ? "animate-pulse" : ""}
              />
              {/* Zone Centroid Badge */}
              <g transform={`translate(${item.centroid.x}, ${item.centroid.y})`}>
                <rect
                  x="-14"
                  y="-3"
                  width="28"
                  height="6"
                  rx="1"
                  fill={item.isBreached ? "rgba(220, 38, 38, 0.9)" : "rgba(15, 23, 42, 0.85)"}
                  stroke={item.isBreached ? "#fca5a5" : "#38bdf8"}
                  strokeWidth="0.3"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x="0"
                  y="1.2"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="2.4"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {item.isBreached ? `⚠️ BREACH: ${item.name.slice(0, 10)}` : `ZONE: ${item.name.slice(0, 12)}`}
                </text>
              </g>
            </g>
          );
        }

        // Line shape: Virtual Tripwire
        const p1 = item.points[0];
        const p2 = item.points[1];
        return (
          <g key={item.id}>
            {/* Tripwire glow */}
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={item.isBreached ? "rgba(239, 68, 68, 0.5)" : "rgba(234, 179, 8, 0.3)"}
              strokeWidth="3.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* Actual Tripwire line */}
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={item.isBreached ? "#ef4444" : "#eab308"}
              strokeWidth="1.2"
              strokeDasharray="3,1.5"
              vectorEffect="non-scaling-stroke"
              className={item.isBreached ? "animate-pulse" : ""}
            />
            {/* Tripwire Tag */}
            <g transform={`translate(${(p1.x + p2.x) / 2}, ${(p1.y + p2.y) / 2})`}>
              <rect
                x="-12"
                y="-2.8"
                width="24"
                height="5.6"
                rx="1"
                fill={item.isBreached ? "#dc2626" : "rgba(15, 23, 42, 0.88)"}
                stroke={item.isBreached ? "#fee2e2" : "#facc15"}
                strokeWidth="0.3"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x="0"
                y="1.1"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="2.2"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                {item.isBreached ? "⚠️ TRIPWIRE CROSSED" : "⚡ VIRTUAL TRIPWIRE"}
              </text>
            </g>
          </g>
        );
      })}

      {/* 3. Real-Time Bounding Boxes & Detection Labels */}
      {boundingBoxes.map((box, idx) => {
        const strokeColor = box.isViolation ? "#ef4444" : "#06b6d4";
        const fillColor = box.isViolation ? "rgba(239, 68, 68, 0.12)" : "rgba(6, 182, 212, 0.08)";
        const cornerLen = Math.min(box.width, box.height) * 0.28;

        return (
          <g key={`bbox-${idx}`} className={box.isViolation ? "animate-pulse" : ""}>
            {/* Bounding Box Body */}
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="0.8"
              strokeDasharray="1,1"
              vectorEffect="non-scaling-stroke"
            />

            {/* High-Tech Tactical Corner Reticles */}
            {/* Top-Left */}
            <path
              d={`M ${box.x} ${box.y + cornerLen} L ${box.x} ${box.y} L ${box.x + cornerLen} ${box.y}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
            {/* Top-Right */}
            <path
              d={`M ${box.x + box.width - cornerLen} ${box.y} L ${box.x + box.width} ${box.y} L ${box.x + box.width} ${box.y + cornerLen}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
            {/* Bottom-Left */}
            <path
              d={`M ${box.x} ${box.y + box.height - cornerLen} L ${box.x} ${box.y + box.height} L ${box.x + cornerLen} ${box.y + box.height}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
            {/* Bottom-Right */}
            <path
              d={`M ${box.x + box.width - cornerLen} ${box.y + box.height} L ${box.x + box.width} ${box.y + box.height} L ${box.x + box.width} ${box.y + box.height - cornerLen}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />

            {/* Tactical Target Center Crosshair */}
            <line
              x1={box.x + box.width / 2 - 1.5}
              y1={box.y + box.height / 2}
              x2={box.x + box.width / 2 + 1.5}
              y2={box.y + box.height / 2}
              stroke={strokeColor}
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={box.x + box.width / 2}
              y1={box.y + box.height / 2 - 1.5}
              x2={box.x + box.width / 2}
              y2={box.y + box.height / 2 + 1.5}
              stroke={strokeColor}
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />

            {/* Detection Header Tag Badge */}
            <g transform={`translate(${box.x}, ${Math.max(2, box.y - 4.5)})`}>
              <rect
                x="0"
                y="0"
                width={Math.max(22, box.width * 0.9)}
                height="4.2"
                rx="0.8"
                fill={box.isViolation ? "#dc2626" : "#0891b2"}
                stroke="#ffffff"
                strokeWidth="0.3"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x="1.5"
                y="3"
                fill="#ffffff"
                fontSize="2.4"
                fontWeight="900"
                fontFamily="ui-monospace, monospace"
                letterSpacing="0.2"
              >
                {box.isViolation ? "⚠ " : ""}{box.label} · {Math.round(box.confidence * 100)}%
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
