"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Bookmark,
  BookmarkPlus,
  Search,
  Filter,
  Play,
  Pause,
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  FileCheck2,
  Clock,
  Download,
  Trash2,
  Edit3,
  Link2,
  Unlink2,
  Plus,
  X,
  RefreshCw,
  Tag,
  Camera,
  Shield,
  Video,
  FileText,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { videoBookmarksApi, camerasApi, incidentsApi } from "@/lib/api-client";

interface CameraItem {
  id: string;
  name: string;
  location?: string;
}

interface IncidentItem {
  id: string;
  title: string;
  incidentNumber?: string;
  severity?: string;
  status?: string;
}

interface VideoBookmark {
  id: string;
  tenantId: string;
  cameraId: string;
  cameraName?: string;
  operatorId: string;
  operatorName?: string;
  timestamp: string;
  bookmarkedAt: string;
  title: string;
  notes?: string;
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
  tags: string[];
  incidentId?: string;
  incidentAssociations: Array<{
    id: string;
    incidentId: string;
    incidentNumber?: string;
    title?: string;
    severity?: string;
    status?: string;
    associationNotes?: string;
    createdAt: string;
  }>;
  verifiedBy?: string;
  verifiedAt?: string;
  reviewStatus?: string;
  exportCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Metrics {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  incidentLinkedCount: number;
  unlinkedCount: number;
  verifiedCount: number;
  recentCount: number;
}

export function VideoBookmarksWorkspace() {
  const [bookmarks, setBookmarks] = useState<VideoBookmark[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    incidentLinkedCount: 0,
    unlinkedCount: 0,
    verifiedCount: 0,
    recentCount: 0,
  });
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [incidentFilter, setIncidentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Playback Simulation & Timeline Scrubbing
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<Date>(new Date());
  const [activeBookmark, setActiveBookmark] = useState<VideoBookmark | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showLinkIncidentModal, setShowLinkIncidentModal] = useState<boolean>(false);
  const [showPromoteModal, setShowPromoteModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [selectedBookmarkForAction, setSelectedBookmarkForAction] = useState<VideoBookmark | null>(null);

  // Form States
  const [formCameraId, setFormCameraId] = useState<string>("");
  const [formTimestamp, setFormTimestamp] = useState<string>(new Date().toISOString());
  const [formTitle, setFormTitle] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formPriority, setFormPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [formReason, setFormReason] = useState<string>("suspicious-activity");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formTagInput, setFormTagInput] = useState<string>("");
  const [formIncidentId, setFormIncidentId] = useState<string>("");
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);

  // Promote Form State
  const [promoteSeverity, setPromoteSeverity] = useState<"P1" | "P2" | "P3" | "P4" | "P5">("P2");
  const [promoteLegalHold, setPromoteLegalHold] = useState<boolean>(true);
  const [promotePreRoll, setPromotePreRoll] = useState<number>(120);
  const [promotePostRoll, setPromotePostRoll] = useState<number>(180);

  // Link Incident Form State
  const [linkTargetIncidentId, setLinkTargetIncidentId] = useState<string>("");
  const [linkNotes, setLinkNotes] = useState<string>("");

  // Export State
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportChecksum, setExportChecksum] = useState<string | null>(null);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [bmRes, metRes, camRes, incRes] = await Promise.allSettled([
        videoBookmarksApi.listBookmarks({
          cameraId: selectedCameraId || undefined,
          priority: priorityFilter !== "all" ? (priorityFilter as any) : undefined,
          hasIncident: incidentFilter === "linked" ? true : incidentFilter === "unlinked" ? false : undefined,
          search: searchQuery.trim() || undefined,
          limit: 100,
        }),
        videoBookmarksApi.getMetrics(selectedCameraId || undefined),
        camerasApi.list(),
        incidentsApi.list({ limit: 100 }),
      ]);

      if (bmRes.status === "fulfilled" && bmRes.value.success) {
        setBookmarks(bmRes.value.data || []);
      }
      if (metRes.status === "fulfilled" && metRes.value.success) {
        setMetrics(metRes.value.data);
      }
      if (camRes.status === "fulfilled") {
        const camData = (camRes.value as any).data || (camRes.value as any) || [];
        setCameras(Array.isArray(camData) ? camData : []);
      }
      if (incRes.status === "fulfilled") {
        const incData = (incRes.value as any).data || (incRes.value as any) || [];
        setIncidents(Array.isArray(incData) ? incData : []);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load video bookmarks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCameraId, priorityFilter, incidentFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set default camera when cameras load
  useEffect(() => {
    if (cameras.length > 0 && !formCameraId) {
      setFormCameraId(cameras[0].id);
    }
  }, [cameras, formCameraId]);

  // Video playback timer simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentPlaybackTime((prev) => new Date(prev.getTime() + 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Handle open create modal
  const handleOpenCreate = (customTime?: string) => {
    const timeToUse = customTime || currentPlaybackTime.toISOString();
    setFormTimestamp(timeToUse);
    setFormTitle("");
    setFormNotes("");
    setFormPriority("medium");
    setFormReason("suspicious-activity");
    setFormTags([]);
    setFormIncidentId("");
    if (!formCameraId && cameras.length > 0) {
      setFormCameraId(cameras[0].id);
    }
    setShowCreateModal(true);
  };

  // Submit Create Bookmark
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCameraId) {
      alert("Please select a camera");
      return;
    }
    if (!formTitle.trim()) {
      alert("Please enter a bookmark title");
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await videoBookmarksApi.createBookmark({
        cameraId: formCameraId,
        timestamp: formTimestamp,
        title: formTitle.trim(),
        notes: formNotes.trim() || undefined,
        priority: formPriority,
        reason: formReason,
        tags: formTags,
        incidentId: formIncidentId || undefined,
      });

      if (res.success) {
        setShowCreateModal(false);
        fetchData();
      } else {
        alert("Failed to create bookmark");
      }
    } catch (err: any) {
      alert(err?.message || "Error creating bookmark");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Submit Edit Bookmark
  const handleOpenEdit = (bm: VideoBookmark) => {
    setSelectedBookmarkForAction(bm);
    setFormTitle(bm.title);
    setFormNotes(bm.notes || "");
    setFormPriority(bm.priority);
    setFormReason(bm.reason);
    setFormTags(bm.tags || []);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookmarkForAction) return;

    try {
      setFormSubmitting(true);
      const res = await videoBookmarksApi.updateBookmark(selectedBookmarkForAction.id, {
        title: formTitle.trim(),
        notes: formNotes.trim() || undefined,
        priority: formPriority,
        reason: formReason,
        tags: formTags,
      });

      if (res.success) {
        setShowEditModal(false);
        fetchData();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to update bookmark");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Bookmark
  const handleDelete = async (bm: VideoBookmark) => {
    if (!confirm(`Are you sure you want to delete bookmark "${bm.title}"?`)) return;
    try {
      const res = await videoBookmarksApi.deleteBookmark(bm.id);
      if (res.success) {
        fetchData();
        if (activeBookmark?.id === bm.id) {
          setActiveBookmark(null);
        }
      }
    } catch (err: any) {
      alert(err?.message || "Failed to delete bookmark");
    }
  };

  // Verify Bookmark
  const handleVerify = async (bm: VideoBookmark) => {
    try {
      const res = await videoBookmarksApi.verifyBookmark(bm.id);
      if (res.success) {
        fetchData();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to verify bookmark");
    }
  };

  // Link Incident
  const handleOpenLinkIncident = (bm: VideoBookmark) => {
    setSelectedBookmarkForAction(bm);
    setLinkTargetIncidentId("");
    setLinkNotes("");
    setShowLinkIncidentModal(true);
  };

  const handleLinkIncidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookmarkForAction || !linkTargetIncidentId) return;

    try {
      setFormSubmitting(true);
      const res = await videoBookmarksApi.associateIncident(selectedBookmarkForAction.id, {
        incidentId: linkTargetIncidentId,
        associationNotes: linkNotes.trim() || undefined,
      });

      if (res.success) {
        setShowLinkIncidentModal(false);
        fetchData();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to associate incident");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Disassociate Incident
  const handleDisassociateIncident = async (bm: VideoBookmark, incidentId: string) => {
    if (!confirm("Disassociate this incident from bookmark?")) return;
    try {
      const res = await videoBookmarksApi.disassociateIncident(bm.id, incidentId);
      if (res.success) {
        fetchData();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to disassociate incident");
    }
  };

  // Promote to Incident
  const handleOpenPromote = (bm: VideoBookmark) => {
    setSelectedBookmarkForAction(bm);
    setPromoteSeverity("P2");
    setPromoteLegalHold(true);
    setPromotePreRoll(120);
    setPromotePostRoll(180);
    setShowPromoteModal(true);
  };

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookmarkForAction) return;

    try {
      setFormSubmitting(true);
      const res = await videoBookmarksApi.createIncidentFromBookmark(selectedBookmarkForAction.id, {
        severity: promoteSeverity,
        applyLegalHold: promoteLegalHold,
        preRollSeconds: promotePreRoll,
        postRollSeconds: promotePostRoll,
        notes: `Promoted from timeline bookmark: ${selectedBookmarkForAction.title}`,
      });

      if (res.success) {
        setShowPromoteModal(false);
        alert(`Incident successfully created and linked! ID: ${res.data.incidentId}`);
        fetchData();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to create incident from bookmark");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Tags management in forms
  const handleAddTag = () => {
    const val = formTagInput.trim().toLowerCase();
    if (val && !formTags.includes(val)) {
      setFormTags([...formTags, val]);
      setFormTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormTags(formTags.filter((t) => t !== tagToRemove));
  };

  // Jump playback to bookmark time
  const handleJumpToBookmark = (bm: VideoBookmark) => {
    const ts = new Date(bm.timestamp);
    if (!isNaN(ts.getTime())) {
      setCurrentPlaybackTime(ts);
      setActiveBookmark(bm);
    }
  };

  // Priority styling helper
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/80 text-red-400 border border-red-800">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            CRITICAL
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            HIGH
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-400 border border-blue-800">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            MEDIUM
          </span>
        );
      case "low":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-slate-400 border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            LOW
          </span>
        );
    }
  };

  // Timeline markers calculation
  const timelineMarkers = useMemo(() => {
    if (bookmarks.length === 0) return [];

    // Sort by timestamp
    const sorted = [...bookmarks].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const minTime = new Date(sorted[0].timestamp).getTime();
    const maxTime = Math.max(
      new Date(sorted[sorted.length - 1].timestamp).getTime(),
      minTime + 3600 * 1000
    );
    const span = maxTime - minTime || 1;

    return sorted.map((bm) => {
      const t = new Date(bm.timestamp).getTime();
      const posPct = Math.min(100, Math.max(0, ((t - minTime) / span) * 100));
      return {
        bookmark: bm,
        leftPercent: posPct,
      };
    });
  }, [bookmarks]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Bookmark className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Video Timeline Bookmarks
                <span className="text-xs font-mono uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                  Production
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Operator tagged timestamps with notes, priority levels, and incident associations.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setRefreshing(true);
              fetchData();
            }}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-sm font-medium transition"
            title="Refresh bookmarks data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-sm font-medium transition"
          >
            <Download className="w-4 h-4" />
            Export Evidence
          </button>

          <button
            onClick={() => handleOpenCreate()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition shadow-lg shadow-blue-600/20"
          >
            <BookmarkPlus className="w-4 h-4" />
            Tag Bookmark
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-800 text-red-200 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900/50 border border-slate-800/80 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>TOTAL BOOKMARKS</span>
            <Bookmark className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{metrics.total}</div>
          <div className="mt-1 text-xs text-slate-500">{metrics.recentCount} tagged in last 24h</div>
        </div>

        <div className="bg-slate-900/50 border border-red-900/40 p-4 rounded-xl">
          <div className="flex items-center justify-between text-red-400 text-xs font-medium">
            <span>CRITICAL (P1)</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-red-400">{metrics.critical}</div>
          <div className="mt-1 text-xs text-slate-500">Requires emergency response</div>
        </div>

        <div className="bg-slate-900/50 border border-amber-900/40 p-4 rounded-xl">
          <div className="flex items-center justify-between text-amber-400 text-xs font-medium">
            <span>HIGH PRIORITY</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">{metrics.high}</div>
          <div className="mt-1 text-xs text-slate-500">Elevated security focus</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800/80 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>INCIDENT ASSOCIATED</span>
            <Link2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">{metrics.incidentLinkedCount}</div>
          <div className="mt-1 text-xs text-slate-500">{metrics.unlinkedCount} unassociated</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800/80 p-4 rounded-xl col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>VERIFIED EVIDENCE</span>
            <FileCheck2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-cyan-400">{metrics.verifiedCount}</div>
          <div className="mt-1 text-xs text-slate-500">Signed & admissible</div>
        </div>
      </div>

      {/* Video Player & Interactive Timeline Scrub Bar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Live & Synchronized Timeline Scrubber</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>{currentPlaybackTime.toISOString().replace("T", " ").substring(0, 19)}</span>
            </div>
            <button
              onClick={() => handleOpenCreate(currentPlaybackTime.toISOString())}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-medium transition"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Mark Current Time
            </button>
          </div>
        </div>

        {/* Video Canvas Placeholder with Controls */}
        <div className="relative aspect-video max-h-[360px] w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex flex-col justify-between p-4">
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1 rounded-md backdrop-blur border border-slate-800 text-xs font-medium text-slate-300">
              <Camera className="w-3.5 h-3.5 text-blue-400" />
              <span>
                {cameras.find((c) => c.id === selectedCameraId)?.name || "All Monitored Cameras"}
              </span>
            </div>
            {activeBookmark && (
              <div className="flex items-center gap-2 bg-red-950/80 px-2.5 py-1 rounded-md backdrop-blur border border-red-800 text-xs text-red-300">
                <Bookmark className="w-3.5 h-3.5" />
                <span>Jumped to: {activeBookmark.title}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-14 h-14 rounded-full bg-blue-600/80 hover:bg-blue-500 flex items-center justify-center text-white shadow-xl backdrop-blur transition hover:scale-105"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
            </button>
          </div>

          <div className="flex items-center justify-between z-10 text-xs text-slate-400">
            <span>Timeline synchronized (VMS stream active)</span>
            <span>Buffered: 100%</span>
          </div>
        </div>

        {/* Scrub Bar with Bookmark Pins */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Timeline Markers ({timelineMarkers.length} tagged points)</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Critical
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> High
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Medium
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-500" /> Low
              </span>
            </div>
          </div>

          <div className="relative w-full h-8 bg-slate-950 rounded-lg border border-slate-800 flex items-center px-2 cursor-pointer group">
            <div className="absolute inset-x-2 h-1.5 bg-slate-800 rounded-full" />

            {/* Pins */}
            {timelineMarkers.map((item, idx) => {
              const pColor =
                item.bookmark.priority === "critical"
                  ? "bg-red-500 hover:bg-red-400"
                  : item.bookmark.priority === "high"
                  ? "bg-amber-500 hover:bg-amber-400"
                  : item.bookmark.priority === "medium"
                  ? "bg-blue-500 hover:bg-blue-400"
                  : "bg-slate-400 hover:bg-slate-300";

              return (
                <div
                  key={item.bookmark.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJumpToBookmark(item.bookmark);
                  }}
                  style={{ left: `${item.leftPercent}%` }}
                  className="absolute -top-1 transform -translate-x-1/2 flex flex-col items-center group/pin z-20 cursor-pointer"
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${pColor} border-2 border-slate-950 shadow-md transition-transform group-hover/pin:scale-150`}
                  />
                  {/* Tooltip */}
                  <div className="opacity-0 group-hover/pin:opacity-100 pointer-events-none absolute bottom-5 mb-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-[11px] text-white whitespace-nowrap shadow-xl z-30 transition-opacity">
                    <div className="font-semibold flex items-center gap-1.5">
                      {item.bookmark.title}
                      {item.bookmark.incidentAssociations.length > 0 && (
                        <span className="text-[9px] bg-red-950 text-red-300 px-1 py-0.2 rounded">
                          INCIDENT
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      {new Date(item.bookmark.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search title, notes, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Camera Selector */}
          <div className="relative min-w-[180px]">
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none pr-8"
            >
              <option value="">All Cameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Priority Filter */}
          <div className="relative min-w-[140px]">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none pr-8"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Incident Association Filter */}
          <div className="relative min-w-[160px]">
            <select
              value={incidentFilter}
              onChange={(e) => setIncidentFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none pr-8"
            >
              <option value="all">All Associations</option>
              <option value="linked">Incident Linked</option>
              <option value="unlinked">Unassociated</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="text-white font-semibold">{bookmarks.length}</span> bookmarks
        </div>
      </div>

      {/* Bookmarks Data Table */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400">Loading timeline bookmarks...</div>
        ) : bookmarks.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Bookmark className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-base font-medium text-white">No timeline bookmarks found</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">
              No bookmarks matched your current filters. Tag an operator timestamp or adjust search criteria.
            </p>
            <button
              onClick={() => handleOpenCreate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition mt-2"
            >
              <Plus className="w-4 h-4" />
              Create First Bookmark
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Timestamp & Camera</th>
                  <th className="py-3.5 px-4">Title & Notes</th>
                  <th className="py-3.5 px-4">Tags & Reason</th>
                  <th className="py-3.5 px-4">Incident Associations</th>
                  <th className="py-3.5 px-4">Verified</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {bookmarks.map((bm) => (
                  <tr
                    key={bm.id}
                    className="hover:bg-slate-800/40 transition group"
                  >
                    {/* Priority */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getPriorityBadge(bm.priority)}
                    </td>

                    {/* Timestamp & Camera */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-mono text-xs font-semibold text-white flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        {new Date(bm.timestamp).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Camera className="w-3 h-3 text-slate-500" />
                        {bm.cameraName || bm.cameraId.substring(0, 8)}
                      </div>
                    </td>

                    {/* Title & Notes */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-medium text-white line-clamp-1">{bm.title}</div>
                      {bm.notes && (
                        <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">{bm.notes}</div>
                      )}
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Operator: {bm.operatorName || bm.operatorId.substring(0, 8)}
                      </div>
                    </td>

                    {/* Tags & Reason */}
                    <td className="py-3.5 px-4">
                      <div className="text-xs text-slate-300 font-medium capitalize">
                        {bm.reason.replace(/-/g, " ")}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {bm.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700"
                          >
                            <Tag className="w-2.5 h-2.5 text-slate-500" />
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Incident Associations */}
                    <td className="py-3.5 px-4">
                      {bm.incidentAssociations.length > 0 ? (
                        <div className="space-y-1">
                          {bm.incidentAssociations.map((assoc) => (
                            <div
                              key={assoc.id}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-950/40 border border-red-800/60 text-xs text-red-300 group/assoc"
                            >
                              <ShieldAlert className="w-3 h-3 text-red-400" />
                              <span className="font-medium">
                                {assoc.incidentNumber || assoc.title || "Incident Linked"}
                              </span>
                              <button
                                onClick={() => handleDisassociateIncident(bm, assoc.incidentId)}
                                title="Unlink Incident"
                                className="ml-1 text-slate-400 hover:text-red-400 opacity-0 group-hover/assoc:opacity-100 transition"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <div>
                            <button
                              onClick={() => handleOpenLinkIncident(bm)}
                              className="text-[11px] text-blue-400 hover:underline inline-flex items-center gap-1 mt-1"
                            >
                              <Plus className="w-3 h-3" /> Link Another
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenLinkIncident(bm)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1 transition"
                          >
                            <Link2 className="w-3 h-3" />
                            Link Incident
                          </button>
                          <button
                            onClick={() => handleOpenPromote(bm)}
                            className="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/50 text-red-300 text-xs font-medium border border-red-800/60 flex items-center gap-1 transition"
                            title="Auto-create Incident with Legal Hold"
                          >
                            <Shield className="w-3 h-3" />
                            Promote
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Verified Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {bm.verifiedAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-cyan-400">
                          <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                          Verified
                        </span>
                      ) : (
                        <button
                          onClick={() => handleVerify(bm)}
                          className="text-xs text-slate-400 hover:text-cyan-400 underline transition"
                        >
                          Verify Now
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleJumpToBookmark(bm)}
                          title="Jump to timeline time"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-400 transition"
                        >
                          <Play className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(bm)}
                          title="Edit Bookmark"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDelete(bm)}
                          title="Delete Bookmark"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/80 text-slate-400 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE BOOKMARK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Tag Video Timeline Bookmark</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Camera
                </label>
                <select
                  value={formCameraId}
                  onChange={(e) => setFormCameraId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                >
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Timeline Timestamp (ISO 8601)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formTimestamp}
                    onChange={(e) => setFormTimestamp(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setFormTimestamp(new Date().toISOString())}
                    className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-xl border border-slate-700"
                  >
                    Now
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Priority Level
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["low", "medium", "high", "critical"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormPriority(p)}
                      className={`py-2 text-xs font-semibold uppercase rounded-xl border transition ${
                        formPriority === p
                          ? p === "critical"
                            ? "bg-red-950 text-red-300 border-red-600"
                            : p === "high"
                            ? "bg-amber-950 text-amber-300 border-amber-600"
                            : p === "medium"
                            ? "bg-blue-950 text-blue-300 border-blue-600"
                            : "bg-slate-800 text-slate-200 border-slate-500"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Reason / Event Category
                </label>
                <select
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="suspicious-activity">Suspicious Activity</option>
                  <option value="cash-discrepancy">Cash Discrepancy / Counter Issue</option>
                  <option value="unauthorized-entry">Unauthorized Entry / Tailgating</option>
                  <option value="customer-dispute">Customer Dispute / Altercation</option>
                  <option value="equipment-failure">Equipment Failure / Defocus</option>
                  <option value="safety-incident">Worker Safety / Slip Fall</option>
                  <option value="theft-attempt">Theft / Tampering Attempt</option>
                  <option value="audit">Routine Audit Observation</option>
                  <option value="other">Other Observation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Unattended parcel near vault door"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Operator Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Detailed notes on what transpired at this timestamp..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Tags Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Tags
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Add tag and press Enter"
                    value={formTagInput}
                    onChange={(e) => setFormTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-xl border border-slate-700"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {formTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 border border-slate-700"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Optional Incident Association */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Associate Existing Incident (Optional)
                </label>
                <select
                  value={formIncidentId}
                  onChange={(e) => setFormIncidentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- None --</option>
                  {incidents.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.incidentNumber ? `[${inc.incidentNumber}] ` : ""}
                      {inc.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  {formSubmitting ? "Saving..." : "Save Bookmark"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && selectedBookmarkForAction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Edit Timeline Bookmark</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Priority
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["low", "medium", "high", "critical"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormPriority(p)}
                      className={`py-2 text-xs font-semibold uppercase rounded-xl border transition ${
                        formPriority === p
                          ? p === "critical"
                            ? "bg-red-950 text-red-300 border-red-600"
                            : p === "high"
                            ? "bg-amber-950 text-amber-300 border-amber-600"
                            : p === "medium"
                            ? "bg-blue-950 text-blue-300 border-blue-600"
                            : "bg-slate-800 text-slate-200 border-slate-500"
                          : "bg-slate-950 text-slate-400 border-slate-800"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Operator Notes
                </label>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  {formSubmitting ? "Updating..." : "Update Bookmark"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINK INCIDENT MODAL */}
      {showLinkIncidentModal && selectedBookmarkForAction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-400" />
                Associate Incident
              </h3>
              <button
                onClick={() => setShowLinkIncidentModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLinkIncidentSubmit} className="p-5 space-y-4">
              <p className="text-xs text-slate-400">
                Linking bookmark:{" "}
                <span className="text-white font-semibold">{selectedBookmarkForAction.title}</span>
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Select Incident
                </label>
                <select
                  value={linkTargetIncidentId}
                  onChange={(e) => setLinkTargetIncidentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="">-- Choose Incident --</option>
                  {incidents.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.incidentNumber ? `[${inc.incidentNumber}] ` : ""}
                      {inc.title} ({inc.severity || "P2"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Association Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Context on why this bookmark is attached to the incident..."
                  value={linkNotes}
                  onChange={(e) => setLinkNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLinkIncidentModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || !linkTargetIncidentId}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  {formSubmitting ? "Linking..." : "Link Incident"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROMOTE TO INCIDENT MODAL */}
      {showPromoteModal && selectedBookmarkForAction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                Promote Bookmark to Incident
              </h3>
              <button
                onClick={() => setShowPromoteModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePromoteSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-200">
                This will create a formal live security incident docket and lock the surrounding video range under evidentiary Legal Hold.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Incident Severity
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(["P1", "P2", "P3", "P4", "P5"] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setPromoteSeverity(sev)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                        promoteSeverity === sev
                          ? "bg-red-950 text-red-300 border-red-600"
                          : "bg-slate-950 text-slate-400 border-slate-800"
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Pre-Roll (Seconds)
                  </label>
                  <input
                    type="number"
                    value={promotePreRoll}
                    onChange={(e) => setPromotePreRoll(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-white"
                    min={0}
                    max={3600}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Post-Roll (Seconds)
                  </label>
                  <input
                    type="number"
                    value={promotePostRoll}
                    onChange={(e) => setPromotePostRoll(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-white"
                    min={0}
                    max={3600}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="legalHoldCheck"
                  checked={promoteLegalHold}
                  onChange={(e) => setPromoteLegalHold(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
                />
                <label htmlFor="legalHoldCheck" className="text-xs text-slate-300 cursor-pointer">
                  Protect range with Immutable Legal Hold
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPromoteModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  {formSubmitting ? "Promoting..." : "Create Incident"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPORT EVIDENCE MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-400" />
                Export Bookmarks Dossier
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Generates a tamper-evident export package containing all matching bookmarks, operator attribution, and incident linkages signed with a cryptographic SHA-256 seal.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                Export Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setExportFormat("json")}
                  className={`py-2.5 rounded-xl text-xs font-semibold uppercase border transition ${
                    exportFormat === "json"
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}
                >
                  JSON (Evidence Manifest)
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat("csv")}
                  className={`py-2.5 rounded-xl text-xs font-semibold uppercase border transition ${
                    exportFormat === "csv"
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}
                >
                  CSV (Spreadsheet)
                </button>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={`/v1/video/bookmarks/export?format=${exportFormat}${
                  selectedCameraId ? `&cameraId=${encodeURIComponent(selectedCameraId)}` : ""
                }`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setTimeout(() => setShowExportModal(false), 500)}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition shadow-lg shadow-blue-600/20"
              >
                <Download className="w-4 h-4" />
                Download Sealed Package
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
