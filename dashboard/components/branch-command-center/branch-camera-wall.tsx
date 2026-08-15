"use client";

import React, { useState, useMemo, useEffect } from "react";
import { CameraTile } from "./camera-tile";
import { ViewerCapacityIndicator } from "../video-wall/viewer-capacity-indicator";
import { useViewerCapacity } from "@/hooks/use-viewer-capacity";
import type { BranchCameraOperationalState, CameraFilter } from "./types";
import type { StreamCandidate } from "@/lib/viewer-capacity";

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
    return cameras.map((cam, index) => {
      const isSelected = cam.cameraId === selectedCameraId;
      const isPinned = pinnedCameraIds.has(cam.cameraId);
      const isAlarm = Boolean(cam.alertActive || cam.alertSeverity);
      const isOffline = cam.health.connectivity === "OFFLINE";
      const isNotRecording = cam.health.recording === "NOT_RECORDING";

      return {
        cameraId: cam.cameraId,
        branchId,
        priority: isSelected ? "P0" : isAlarm ? "P1" : isPinned ? "P3" : isNotRecording ? "P2" : "P4",
        requestedQuality: isSelected ? "FOCUSED" : "GRID",
        stream: {
          cameraId: cam.cameraId,
          codec: "H264",
          width: isSelected ? 1920 : 640,
          height: isSelected ? 1080 : 360,
          fps: isSelected ? 25 : 8,
          bitrateMbps: isSelected ? 3.5 : 0.45,
          streamType: isSelected ? "MAIN" : "SUB",
          transport: "WEBRTC",
        },
        visible: true,
        selected: isSelected,
        alarmActive: isAlarm,
        alertSeverity: cam.alertSeverity,
        pinned: isPinned,
        healthState: isOffline ? "OFFLINE" : isNotRecording ? "WARNING" : "HEALTHY",
      };
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
