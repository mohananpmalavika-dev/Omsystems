"use client";

import {
  Camera,
  Grid,
  Grid3x3,
  Link as LinkIcon,
  Maximize,
  Pause,
  Play,
  Square,
  Unlink,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useNotifications } from "./notifications/NotificationsProvider";
import Link from "next/link";
import { PlaybackController } from "./playback-controller";
import { playbackApi, cameraApi, branchApi } from "@/lib/api-client";

interface CameraStream {
  cameraId: string;
  cameraName: string;
  segmentId: string;
  startTime: string;
  endTime: string;
  branchId?: string;
  location?: string;
}

interface SyncedPlaybackViewProps {
  streams: CameraStream[];
  syncEnabled?: boolean;
  onSyncToggle?: (enabled: boolean) => void;
  evidenceCaseId?: string;
  masterCameraId?: string;
  onMasterChange?: (cameraId: string) => void;
  // Optional: request synchronized playback for these camera IDs or a saved group
  cameraIds?: string[];
  groupId?: string;
  fromTime?: string;
  toTime?: string;
  // When true (default) the component will auto-load synchronized playback
  autoLoad?: boolean;
  // Optional ref that receives the `loadSyncData` function so parents can trigger it
  loadSyncDataRef?: React.MutableRefObject<((params?: { cameraIds?: string[]; groupId?: string; fromTime?: string; toTime?: string; masterCameraId?: string; layout?: string }) => Promise<void>) | null>;
}

type GridLayout = "1x1" | "2x2" | "3x3" | "2x3" | "4x4";

export function SyncedPlaybackView({
  streams,
  syncEnabled = true,
  onSyncToggle,
  evidenceCaseId,
  masterCameraId,
  onMasterChange,
  cameraIds,
  groupId,
  fromTime,
  toTime,
  autoLoad = true,
  loadSyncDataRef,
}: SyncedPlaybackViewProps) {
  const [isSynced, setIsSynced] = useState(syncEnabled);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gridLayout, setGridLayout] = useState<GridLayout>("2x2");
  const [masterCamera, setMasterCamera] = useState<string>(
    masterCameraId || streams[0]?.cameraId || "",
  );
  const [focusedCamera, setFocusedCamera] = useState<string | null>(null);
  const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeOffsetsRef = useRef<Record<string, number>>({});

  // Local streams state — will be replaced when synchronized playback is loaded
  const [localStreams, setLocalStreams] = useState<CameraStream[]>(streams);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; cameraIds?: string[] }>>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [cameraMap, setCameraMap] = useState<Record<string, { id: string; name: string; branch?: string; location?: string }>>({});
  const [branchMap, setBranchMap] = useState<Record<string, { id: string; name: string }>>({});
  const { showToast, confirm } = useNotifications();

  // Get grid dimensions from layout
  const getGridDimensions = (layout: GridLayout): { rows: number; cols: number } => {
    switch (layout) {
      case "1x1":
        return { rows: 1, cols: 1 };
      case "2x2":
        return { rows: 2, cols: 2 };
      case "3x3":
        return { rows: 3, cols: 3 };
      case "2x3":
        return { rows: 2, cols: 3 };
      case "4x4":
        return { rows: 4, cols: 4 };
      default:
        return { rows: 2, cols: 2 };
    }
  };

  // Auto-select best grid layout
  useEffect(() => {
    const count = localStreams.length;
    if (count === 1) setGridLayout("1x1");
    else if (count <= 4) setGridLayout("2x2");
    else if (count <= 6) setGridLayout("2x3");
    else if (count <= 9) setGridLayout("3x3");
    else setGridLayout("4x4");
  }, [streams.length]);

  // Sync timer for synchronized playback
  useEffect(() => {
    if (!isSynced || !isPlaying) {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
      return;
    }

    syncTimerRef.current = setInterval(() => {
      const masterVideo = videoRefs.current[masterCamera];
      if (!masterVideo) return;

      const masterTime = masterVideo.currentTime;

      // Sync all other videos to master, applying per-camera time offsets (seconds)
      Object.entries(videoRefs.current).forEach(([cameraId, video]) => {
        if (cameraId === masterCamera || !video) return;

        const offset = timeOffsetsRef.current[cameraId] ?? 0;
        const target = masterTime + offset;
        const timeDiff = Math.abs(video.currentTime - target);
        if (timeDiff > 0.3) {
          // More than 300ms drift
          try {
            video.currentTime = target;
          } catch (e) {
            // Some browsers throw if setting currentTime during buffering; ignore
          }
        }
      });
    }, 500); // Check sync every 500ms

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, [isSynced, isPlaying, masterCamera]);

  // Handle sync toggle
  const handleSyncToggle = () => {
    const newSyncState = !isSynced;
    setIsSynced(newSyncState);
    onSyncToggle?.(newSyncState);

    if (newSyncState && isPlaying) {
      // Immediately sync all videos to master
      const masterVideo = videoRefs.current[masterCamera];
      if (masterVideo) {
        const masterTime = masterVideo.currentTime;
        Object.entries(videoRefs.current).forEach(([cameraId, video]) => {
          if (cameraId !== masterCamera && video) {
            video.currentTime = masterTime;
          }
        });
      }
    }
  };

  // Handle global play/pause
  const handleGlobalPlayPause = () => {
    const newPlayState = !isPlaying;
    setIsPlaying(newPlayState);

    Object.values(videoRefs.current).forEach((video) => {
      if (video) {
        if (newPlayState) {
          video.play();
        } else {
          video.pause();
        }
      }
    });
  };

  // Handle master camera change
  const handleMasterChange = (cameraId: string) => {
    setMasterCamera(cameraId);
    onMasterChange?.(cameraId);

    // If synced and playing, sync all to new master
    if (isSynced && isPlaying) {
      const newMasterVideo = videoRefs.current[cameraId];
      if (newMasterVideo) {
        const masterTime = newMasterVideo.currentTime;
        Object.entries(videoRefs.current).forEach(([id, video]) => {
          if (id !== cameraId && video) {
            video.currentTime = masterTime;
          }
        });
      }
    }
  };

  // Handle camera focus (maximize single camera)
  const handleCameraFocus = (cameraId: string) => {
    setFocusedCamera(focusedCamera === cameraId ? null : cameraId);
  };

  // Video ref setter
  const setVideoRef = (cameraId: string, ref: HTMLVideoElement | null) => {
    videoRefs.current[cameraId] = ref;
  };

  // Update current times
  const handleTimeUpdate = (cameraId: string, time: number) => {
    setCurrentTimes((prev) => ({ ...prev, [cameraId]: time }));
  };

  const { rows, cols } = getGridDimensions(gridLayout);
  const visibleStreams = focusedCamera
    ? localStreams.filter((s) => s.cameraId === focusedCamera)
    : localStreams.slice(0, rows * cols);

  // Load controls state (datetime-local expects YYYY-MM-DDTHH:MM)
  const toLocalInput = (iso?: string) => {
    if (!iso) return new Date().toISOString().slice(0, 16);
    return iso.slice(0, 16);
  };

  const [fromInput, setFromInput] = useState<string>(toLocalInput(fromTime));
  const [toInput, setToInput] = useState<string>(toLocalInput(toTime));

  const handleLoadClick = async () => {
    const ids = cameraIds && cameraIds.length > 0 ? cameraIds : streams.map((s) => s.cameraId);
    try {
      await loadSyncData({
        cameraIds: ids,
        fromTime: new Date(fromInput).toISOString(),
        toTime: new Date(toInput).toISOString(),
      });
      showToast('Synchronized playback loaded', 'success');
    } catch (err) {
      showToast('Error loading synchronized playback', 'error');
    }
  };

  // If streams provided as camera IDs only, try to fetch synchronized playback data
  // Keep localStreams in sync with outer prop updates unless we've loaded synced data
  useEffect(() => {
    setLocalStreams(streams);
  }, [streams]);

  // Build a loader that parents can call (or auto-invoke)
  const loadSyncData = async (params?: { cameraIds?: string[]; groupId?: string; fromTime?: string; toTime?: string; masterCameraId?: string; layout?: string }) => {
    const payload = {
      cameraIds: params?.cameraIds ?? cameraIds ?? [],
      groupId: params?.groupId ?? groupId,
      fromTime: params?.fromTime ?? fromTime,
      toTime: params?.toTime ?? toTime,
      masterCameraId: params?.masterCameraId ?? masterCameraId,
      layout: params?.layout ?? (gridLayout === '1x1' ? 'stacked' : 'grid'),
    };

    if (!payload.cameraIds?.length && !payload.groupId) return;

    try {
      const resp = await playbackApi.getSynchronizedPlayback({
        cameraIds: payload.cameraIds,
        masterCameraId: payload.masterCameraId,
        fromTime: String(payload.fromTime),
        toTime: String(payload.toTime),
        groupId: payload.groupId,
        layout: payload.layout as any,
      });

      // Expecting shape: { cameras: [{ cameraId, cameraName, segments: [{ id, startedAt, endedAt }], timeOffset }] }
      const cams = (resp?.cameras ?? []) as any[];
      const mapped: CameraStream[] = cams.map((c) => {
        const seg = Array.isArray(c.segments) && c.segments.length > 0 ? c.segments[0] : null;
        const segmentId = seg?.id || seg?.segmentId || seg?.segment_id || '';
        // store timeOffset (ms -> seconds)
        timeOffsetsRef.current[c.cameraId] = (c.timeOffset ?? 0) / 1000;
        return {
          cameraId: c.cameraId,
          cameraName: c.cameraName || c.camera_id || c.cameraId,
          segmentId,
          startTime: seg?.startedAt || seg?.startTime || '',
          endTime: seg?.endedAt || seg?.endTime || '',
          branchId: c.branchId,
          location: c.location,
        } as CameraStream;
      });

      setLocalStreams(mapped);

      // Set master camera if provided by response
      if (resp.masterCameraId) {
        setMasterCamera(resp.masterCameraId);
      }
    } catch (err) {
      console.error('Failed to load synchronized playback', err);
      throw err;
    }
  };

  // Expose loader to parent via ref if provided
  useEffect(() => {
    if (loadSyncDataRef) {
      loadSyncDataRef.current = loadSyncData;
    }
    return () => {
      if (loadSyncDataRef) loadSyncDataRef.current = null;
    };
  }, [loadSyncDataRef, cameraIds, groupId, fromTime, toTime, masterCameraId, gridLayout]);

  // Fetch saved groups for selector
  useEffect(() => {
    let mounted = true;
    playbackApi.listGroups()
      .then((r) => {
        if (!mounted) return;
        const list = (r?.data ?? []) as any[];
        setGroups(list.map((g) => ({ id: g.id || g.groupId || g.name, name: g.name || g.groupId || g.id, cameraIds: g.cameraIds || g.cameras, fromTime: g.fromTime || g.from || g.start, toTime: g.toTime || g.to || g.end })));
      })
      .catch((err) => {
        // non-fatal
        console.debug('Could not load playback groups', err);
      });
    return () => { mounted = false; };
  }, []);

  // When a group is selected, fetch camera names for display
  useEffect(() => {
    if (!selectedGroup) return;
    const g = groups.find((x) => x.id === selectedGroup);
    if (!g || !g.cameraIds?.length) return;

    const missing = g.cameraIds.filter((id) => !cameraMap[id]);
    if (missing.length === 0) return;

    let mounted = true;
    Promise.all(missing.map((id) => cameraApi.get(id).catch(() => null)))
      .then((results) => {
        if (!mounted) return;
        const updates: Record<string, { id: string; name: string; branch?: string; location?: string }> = {};
        results.forEach((res, i) => {
          const id = missing[i];
          if (res) updates[id] = { id, name: res.name || res.model || id, branch: res.branchId || res.branch || res.branchName, location: res.location || res.site || undefined };
          else updates[id] = { id, name: id };
        });
        setCameraMap((prev) => ({ ...prev, ...updates }));
        // Collect branch IDs and fetch branch display names
        const branchIds = Array.from(new Set(results.map((res) => res?.branchId || res?.branch || res?.branchName).filter(Boolean)));
        const missingBranchIds = branchIds.filter((bid) => bid && !branchMap[bid]);
        if (missingBranchIds.length > 0) {
          Promise.all(missingBranchIds.map((b) => branchApi.get(b).catch(() => null)))
            .then((branches) => {
              if (!mounted) return;
              const bUpdates: Record<string, { id: string; name: string }> = {};
              branches.forEach((bRes, idx) => {
                const id = missingBranchIds[idx];
                if (bRes) bUpdates[id] = { id, name: bRes.name || bRes.displayName || id };
                else bUpdates[id] = { id, name: id };
              });
              setBranchMap((prev) => ({ ...prev, ...bUpdates }));
              // Merge branch display names into cameraMap
              setCameraMap((prev) => {
                const merged = { ...prev };
                Object.entries(merged).forEach(([cid, cam]) => {
                  const bid = cam.branch;
                  if (bid && bUpdates[bid]) merged[cid] = { ...cam, branch: bUpdates[bid].name };
                });
                return merged;
              });
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        /* noop */
      });
    return () => {
      mounted = false;
    };
  }, [selectedGroup, groups]);

  // Auto-invoke loader when initial source is provided and autoLoad is true
  useEffect(() => {
    if (!autoLoad) return;
    if ((cameraIds && cameraIds.length > 0) || groupId) {
      // fire-and-forget
      loadSyncData().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="synced-playback-view">
      {/* Control Bar */}
      <div className="control-bar">
        <div className="control-group">
          <h3>
            <Camera size={20} />
            Multi-Camera Playback
          </h3>
          <span className="camera-count">
            {streams.length} camera{streams.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="control-actions">
          {/* Time window pickers and Load button */}
          <div className="time-pickers" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="datetime-local"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              title="From"
            />
            <input
              type="datetime-local"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              title="To"
            />
            <button className="load-button" onClick={handleLoadClick} title="Load synchronized playback">
              Load
            </button>
          </div>
          {/* Saved groups selector */}
          <div className="groups-select" style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ color: '#9ca3af', marginRight: 6 }}>Saved Group:</label>
            <select
              value={selectedGroup ?? ''}
              onChange={(e) => {
                const gid = e.target.value || null;
                setSelectedGroup(gid);
                // Auto-fill group's preferred times if present
                const g = groups.find((x) => x.id === gid);
                if (g) {
                  const fromStored = (g as any).fromTime || (g as any).from || (g as any).start;
                  const toStored = (g as any).toTime || (g as any).to || (g as any).end;
                  if (fromStored) setFromInput(toLocalInput(fromStored));
                  if (toStored) setToInput(toLocalInput(toStored));
                }
              }}
            >
              <option value="">--</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!selectedGroup) return;
                // Confirm if there are existing local streams
                if (localStreams && localStreams.length > 0) {
                  const ok = await confirm('Loading this group will replace current streams. Continue?', 'Load Group');
                  if (!ok) return;
                }

                try {
                  await loadSyncData({ groupId: selectedGroup });
                  showToast('Group loaded', 'success');
                } catch (err) {
                  showToast('Failed to load group', 'error');
                }
              }}
              title="Load selected group"
            >
              Load Group
            </button>
          </div>
          {/* Master Camera Selection */}
          <div className="master-select">
            <label>Master Camera:</label>
            <select
              value={masterCamera}
              onChange={(e) => handleMasterChange(e.target.value)}
              disabled={!isSynced}
            >
              {localStreams.map((stream) => (
                <option key={stream.cameraId} value={stream.cameraId}>
                  {stream.cameraName}
                </option>
              ))}
            </select>
          </div>

          {/* Sync Toggle */}
          <button
            className={`sync-button ${isSynced ? "active" : ""}`}
            onClick={handleSyncToggle}
            title={isSynced ? "Disable sync" : "Enable sync"}
          >
            {isSynced ? (
              <>
                <LinkIcon size={16} />
                Synced
              </>
            ) : (
              <>
                <Unlink size={16} />
                Independent
              </>
            )}
          </button>

          {/* Global Play/Pause */}
          <button
            className="play-button"
            onClick={handleGlobalPlayPause}
            title={isPlaying ? "Pause all" : "Play all"}
          >
            {isPlaying ? (
              <>
                <Pause size={18} />
                Pause All
              </>
            ) : (
              <>
                <Play size={18} />
                Play All
              </>
            )}
          </button>

          {/* Layout Selector */}
          <div className="layout-selector">
            <button
              className={gridLayout === "1x1" ? "active" : ""}
              onClick={() => setGridLayout("1x1")}
              title="1x1 Grid"
            >
              <Square size={16} />
            </button>
            <button
              className={gridLayout === "2x2" ? "active" : ""}
              onClick={() => setGridLayout("2x2")}
              title="2x2 Grid"
            >
              <Grid size={16} />
            </button>
            <button
              className={gridLayout === "3x3" ? "active" : ""}
              onClick={() => setGridLayout("3x3")}
              title="3x3 Grid"
            >
              <Grid3x3 size={16} />
            </button>
          </div>
        </div>
      </div>

        {/* Video Grid */}
        {/* Confirmation is handled by NotificationsProvider (global modal) */}
      {/* Group details (show camera list before load) */}
      {selectedGroup && (
        <div className="group-details">
          <div className="group-details-header">
            <div>
              <div className="group-details-title">Group</div>
              <div className="group-details-name">{groups.find((g) => g.id === selectedGroup)?.name}</div>
            </div>
            <div className="group-details-summary">
              {groups.find((g) => g.id === selectedGroup)?.cameraIds?.length ?? 0} cameras
            </div>
          </div>
          <div className="group-details-body">
            <div className="group-details-label">Included cameras</div>
            <ul className="group-camera-list">
              {(groups.find((g) => g.id === selectedGroup)?.cameraIds ?? []).map((cid) => (
                <li key={cid} className="group-camera-item">
                  <Link
                    href={`/maintenance/privacy/cameras/${encodeURIComponent(cid)}/purposes`}
                    className="group-camera-card"
                  >
                    <div className="group-camera-card-avatar">
                      {cameraMap[cid]?.name ? cameraMap[cid].name.charAt(0).toUpperCase() : "C"}
                    </div>
                    <div className="group-camera-card-content">
                      <div className="group-camera-card-title">{cameraMap[cid]?.name ?? cid}</div>
                      <div className="group-camera-card-meta">{cameraMap[cid]?.location ?? "Unknown location"}</div>
                    </div>
                    {cameraMap[cid]?.branch && (
                      <div className="group-camera-card-branch">{cameraMap[cid]?.branch}</div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div
        className="video-grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {visibleStreams.map((stream) => (
          <div
            key={stream.cameraId}
            className={`video-cell ${masterCamera === stream.cameraId ? "master" : ""} ${focusedCamera === stream.cameraId ? "focused" : ""}`}
          >
            {/* Camera Header */}
            <div className="camera-header">
              <div className="camera-info">
                <Camera size={14} />
                <span className="camera-name">{cameraMap[stream.cameraId]?.name ?? stream.cameraName}</span>
                {cameraMap[stream.cameraId]?.branch && (
                  <span className="camera-branch">{cameraMap[stream.cameraId]?.branch}</span>
                )}
                {(cameraMap[stream.cameraId]?.location || stream.location) && (
                  <span className="camera-location">{cameraMap[stream.cameraId]?.location ?? stream.location}</span>
                )}
              </div>
              <div className="camera-actions">
                {masterCamera === stream.cameraId && (
                  <span className="master-badge">MASTER</span>
                )}
                <button
                  className="focus-button"
                  onClick={() => handleCameraFocus(stream.cameraId)}
                  title={
                    focusedCamera === stream.cameraId
                      ? "Exit fullscreen"
                      : "Fullscreen"
                  }
                >
                  <Maximize size={14} />
                </button>
              </div>
            </div>

            {/* Video Element */}
            <div className="video-wrapper">
              <video
                ref={(ref) => setVideoRef(stream.cameraId, ref)}
                className="video-element"
                src={`/api/recordings/play?segmentId=${encodeURIComponent(stream.segmentId)}`}
                onTimeUpdate={(e) =>
                  handleTimeUpdate(
                    stream.cameraId,
                    e.currentTarget.currentTime,
                  )
                }
              >
                Your browser does not support video playback.
              </video>

              {/* Time Display */}
              <div className="time-overlay">
                {formatTime(currentTimes[stream.cameraId] || 0)}
              </div>

              {/* Sync Status Indicator */}
              {isSynced && masterCamera !== stream.cameraId && (
                <div className="sync-indicator">
                  <LinkIcon size={12} />
                </div>
              )}
            </div>

            {/* Mini Controls */}
            <div className="mini-controls">
              <input
                type="range"
                min="0"
                max={
                  videoRefs.current[stream.cameraId]?.duration || 100
                }
                value={currentTimes[stream.cameraId] || 0}
                onChange={(e) => {
                  const video = videoRefs.current[stream.cameraId];
                  if (video) {
                    video.currentTime = parseFloat(e.target.value);
                  }
                }}
                className="timeline-slider"
                disabled={isSynced && masterCamera !== stream.cameraId}
              />
            </div>
          </div>
        ))}

        {/* Empty Cells */}
        {Array.from({
          length: Math.max(0, rows * cols - visibleStreams.length),
        }).map((_, i) => (
          <div key={`empty-${i}`} className="video-cell empty">
            <div className="empty-state">
              <Camera size={32} />
              <span>No camera</span>
            </div>
          </div>
        ))}
      </div>

      {/* Global toasts rendered by NotificationsProvider */}
      {/* Sync Status Footer */}
      {isSynced && (
        <div className="sync-status">
          <LinkIcon size={14} />
          <span>
            All cameras synchronized to <strong>{streams.find((s) => s.cameraId === masterCamera)?.cameraName || "master"}</strong>
          </span>
        </div>
      )}

      {/* Evidence Case Badge */}
      {evidenceCaseId && (
        <div className="evidence-badge-footer">
          Evidence Case ID: {evidenceCaseId}
        </div>
      )}

      <style jsx>{`
        .synced-playback-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #0f0f0f;
          border-radius: 8px;
          overflow: hidden;
        }

        .control-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #1a1a1a;
          border-bottom: 1px solid #2a2a2a;
        }

        .control-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .control-group h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 18px;
          color: white;
        }

        .camera-count {
          padding: 4px 10px;
          background: #2a2a2a;
          border-radius: 4px;
          font-size: 13px;
          color: #9ca3af;
        }

        .control-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .master-select {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: white;
        }

        .master-select label {
          color: #9ca3af;
        }

        .master-select select {
          padding: 6px 12px;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 6px;
          color: white;
          font-size: 14px;
          cursor: pointer;
        }

        .master-select select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sync-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .sync-button.active {
          background: #3b82f6;
          border-color: #3b82f6;
        }

        .sync-button:hover {
          background: #3a3a3a;
        }

        .sync-button.active:hover {
          background: #2563eb;
        }

        .play-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #10b981;
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .play-button:hover {
          background: #059669;
        }

        .layout-selector {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: #2a2a2a;
          border-radius: 6px;
        }

        .layout-selector button {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #9ca3af;
          cursor: pointer;
          transition: all 0.2s;
        }

        .layout-selector button:hover {
          background: #3a3a3a;
          color: white;
        }

        .layout-selector button.active {
          background: #3b82f6;
          color: white;
        }

        .video-grid {
          display: grid;
          flex: 1;
          gap: 2px;
          padding: 2px;
          background: #0a0a0a;
          overflow: auto;
        }

        .video-cell {
          position: relative;
          display: flex;
          flex-direction: column;
          background: #1a1a1a;
          border-radius: 4px;
          overflow: hidden;
          min-height: 200px;
        }

        .video-cell.master {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }

        .video-cell.focused {
          grid-column: 1 / -1;
          grid-row: 1 / -1;
        }

        .video-cell.empty {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: #4b5563;
        }

        .camera-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #2a2a2a;
          border-bottom: 1px solid #3a3a3a;
        }

        .camera-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: white;
          flex-wrap: wrap;
        }

        .camera-name {
          font-weight: 500;
        }

        .camera-branch,
        .camera-location {
          color: #9ca3af;
          font-size: 12px;
        }

        .camera-branch {
          padding: 2px 6px;
          background: rgba(59, 130, 246, 0.12);
          border-radius: 999px;
          margin-left: 4px;
        }

        .group-details {
          padding: 16px;
          background: #111217;
          border: 1px solid #1a1f2c;
          border-radius: 10px;
          margin: 10px 20px;
          color: #cbd5e1;
        }

        .group-details-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 14px;
        }

        .group-details-title {
          color: #7c93b8;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 4px;
        }

        .group-details-name {
          font-size: 16px;
          font-weight: 600;
          color: white;
        }

        .group-details-summary {
          color: #9ca3af;
          font-size: 13px;
          white-space: nowrap;
        }

        .group-details-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .group-details-label {
          color: #9ca3af;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .group-camera-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 10px;
          margin: 0;
          padding: 0;
          list-style: none;
          max-height: 220px;
          overflow: auto;
        }

        .group-camera-item {
          margin: 0;
        }

        .group-camera-card {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: #0f1726;
          border: 1px solid #1a2140;
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
          transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }

        .group-camera-card:hover {
          transform: translateY(-1px);
          background: #151f34;
          border-color: #2d3b60;
        }

        .group-camera-card-avatar {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          background: #1b2a47;
          border-radius: 50%;
          color: #9ca3af;
          font-size: 14px;
          font-weight: 700;
        }

        .group-camera-card-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .group-camera-card-title {
          font-size: 14px;
          font-weight: 600;
          color: white;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .group-camera-card-meta {
          color: #9ca3af;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .group-camera-card-branch {
          color: #cbd5e1;
          font-size: 12px;
          padding: 4px 8px;
          background: rgba(59, 130, 246, 0.12);
          border-radius: 999px;
          white-space: nowrap;
        }

        .camera-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .master-badge {
          padding: 2px 6px;
          background: #3b82f6;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          color: white;
        }

        .focus-button {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #9ca3af;
          cursor: pointer;
        }

        .focus-button:hover {
          background: #3a3a3a;
          color: white;
        }

        .video-wrapper {
          position: relative;
          flex: 1;
          background: #000;
        }

        .video-element {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .time-overlay {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          color: white;
          font-family: monospace;
        }

        .sync-indicator {
          position: absolute;
          top: 8px;
          left: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: rgba(59, 130, 246, 0.8);
          border-radius: 50%;
          color: white;
        }

        .mini-controls {
          padding: 8px 12px;
          background: #2a2a2a;
        }

        .timeline-slider {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          cursor: pointer;
          appearance: none;
        }

        .timeline-slider:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .timeline-slider::-webkit-slider-thumb {
          appearance: none;
          width: 10px;
          height: 10px;
          background: #3b82f6;
          border-radius: 50%;
          cursor: pointer;
        }

        .sync-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: #1a1a1a;
          border-top: 1px solid #2a2a2a;
          color: #9ca3af;
          font-size: 14px;
        }

        .sync-status strong {
          color: #3b82f6;
        }

        .evidence-badge-footer {
          padding: 8px 20px;
          background: #7c2d12;
          border-top: 1px solid #991b1b;
          color: #fecaca;
          font-size: 13px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}

// Helper function
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}
