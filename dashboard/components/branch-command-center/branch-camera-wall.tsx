"use client";

import React, { useState, useMemo, useEffect } from "react";
import { CameraTile } from "./camera-tile";
import { ViewerCapacityIndicator } from "../video-wall/viewer-capacity-indicator";
import { useViewerCapacity } from "@/hooks/use-viewer-capacity";
import type { BranchCameraOperationalState, CameraFilter } from "./types";
import type { CodecType, StreamCandidate, StreamProfile, TransportType } from "@/lib/viewer-capacity";

function getAdvertisedStream(camera: BranchCameraOperationalState, selected: boolean): StreamProfile | null {
  const advertised = selected
    ? camera.streamProfiles?.main
    : camera.streamProfiles?.sub ?? camera.streamProfiles?.main;
  if (!advertised || typeof advertised !== "object") return null;

  const codecValue = String(advertised.codec ?? "").toUpperCase();
  const codec: CodecType | null = codecValue === "H264" || codecValue === "H265" || codecValue === "AV1"
    ? codecValue
    : null;
  const transportValue = String(advertised.transport ?? "OTHER").toUpperCase();
  const transport: TransportType = transportValue === "WEBRTC" || transportValue === "HLS" || transportValue === "MSE"
    ? transportValue
    : "OTHER";
  const width = Number(advertised.width);
  const height = Number(advertised.height);
  const fps = Number(advertised.fps);
  const bitrateMbps = Number(advertised.bitrateMbps ?? (
    advertised.bitrateKbps !== undefined
      ? Number(advertised.bitrateKbps) / 1000
      : Number(advertised.estimatedBitrateKbps) / 1000
  ));
  if (!codec || ![width, height, fps, bitrateMbps].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }

  return {
    cameraId: camera.cameraId,
    codec,
    width,
    height,
    fps,
    bitrateMbps,
    streamType: selected ? "MAIN" : "SUB",
    transport,
  };
}

export interface BranchCameraWallProps {
  branchId: string;
  cameras: BranchCameraOperationalState[];
  activeFilter?: CameraFilter;
  onInvestigateCamera?: (cameraId: string) => void;
}

export function BranchCameraWall({
  branchId,
  cameras,
  activeFilter = "ALL",
  onInvestigateCamera,
}: BranchCameraWallProps) {
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [pinnedCameraIds, setPinnedCameraIds] = useState<Set<string>>(new Set());

  // Initialize Viewer Capacity Manager
  const {
    capacity,
    telemetry,
    tileStates,
    rebalanceGrid,
    promoteCamera,
  } = useViewerCapacity({ customDecoderLimit: 16 });

  // Map cameras to scheduling candidates
  const candidates: StreamCandidate[] = useMemo(() => {
    return cameras.flatMap((cam) => {
      const isSelected = cam.cameraId === selectedCameraId;
      const isPinned = pinnedCameraIds.has(cam.cameraId);
      const isAlarm = Boolean(cam.alertActive || cam.alertSeverity);
      const isOffline = cam.health.connectivity === "OFFLINE";
      const isNotRecording = cam.health.recording === "NOT_RECORDING";

      const stream = getAdvertisedStream(cam, isSelected);
      if (!stream) return [];

      return [{
        cameraId: cam.cameraId,
        branchId,
        priority: isSelected ? "P0" : isAlarm ? "P1" : isPinned ? "P3" : isNotRecording ? "P2" : "P4",
        requestedQuality: isSelected ? "FOCUSED" : "GRID",
        stream,
        visible: true,
        selected: isSelected,
        alarmActive: isAlarm,
        alertSeverity: cam.alertSeverity,
        pinned: isPinned,
        healthState: isOffline ? "OFFLINE" : isNotRecording ? "WARNING" : "HEALTHY",
      }];
    });
  }, [cameras, branchId, selectedCameraId, pinnedCameraIds]);

  // Rebalance grid when candidates or selection change
  useEffect(() => {
    rebalanceGrid(candidates);
  }, [candidates, rebalanceGrid]);

  // Filter camera view
  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      if (activeFilter === "ALL") return true;
      if (activeFilter === "LIVE") return cam.health.connectivity === "ONLINE";
      if (activeFilter === "OFFLINE") return cam.health.connectivity === "OFFLINE";
      if (activeFilter === "NO_RECORD") return cam.health.recording === "NOT_RECORDING";
      if (activeFilter === "ALERTING") return Boolean(cam.alertActive || cam.alertSeverity);
      if (activeFilter === "PINNED") return pinnedCameraIds.has(cam.cameraId);
      return true;
    });
  }, [cameras, activeFilter, pinnedCameraIds]);

  const handlePinToggle = (cameraId: string) => {
    setPinnedCameraIds((prev) => {
      const next = new Set(prev);
      if (next.has(cameraId)) next.delete(cameraId);
      else next.add(cameraId);
      return next;
    });
  };

  const handleDoubleClick = async (cameraId: string) => {
    if (selectedCameraId === cameraId) {
      setSelectedCameraId(null);
    } else {
      setSelectedCameraId(cameraId);
      await promoteCamera(cameraId, "P0", { requestedQuality: "FOCUSED" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Capacity & Telemetry Bar */}
      <ViewerCapacityIndicator
        capacity={capacity}
        performance={telemetry ?? undefined}
        rotatingCount={Math.max(0, cameras.length - capacity.activeDecoders)}
      />

      {/* Camera Grid Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {filteredCameras.map((camera) => {
          const tileState = tileStates.get(camera.cameraId);
          const isDecoderAllocated = tileState?.decoderAllocated ?? false;
          const isSelected = selectedCameraId === camera.cameraId;
          const isPinned = pinnedCameraIds.has(camera.cameraId);

          return (
            <CameraTile
              key={camera.cameraId}
              camera={camera}
              isDecoderAllocated={isDecoderAllocated}
              isSelected={isSelected}
              isPinned={isPinned}
              quality={isSelected ? "MAIN" : "SUB"}
              onSelect={(id) => setSelectedCameraId(id)}
              onDoubleClick={handleDoubleClick}
              onPinToggle={handlePinToggle}
              onInvestigate={onInvestigateCamera}
            />
          );
        })}
      </div>
    </div>
  );
}
