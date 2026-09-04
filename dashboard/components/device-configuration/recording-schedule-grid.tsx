"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { deviceConfigurationApi } from "@/lib/api-client";

export type RecordingPeriodType = "CONTINUOUS" | "MOTION" | "ALARM" | "OFF";

export interface SchedulePeriod {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  type: RecordingPeriodType;
}

export interface DailySchedule {
  day: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
  periods: SchedulePeriod[];
}

export interface RecordingScheduleData {
  channelNumber: number;
  enabled: boolean;
  schedule: DailySchedule[];
  preRecordSeconds?: number;
  postRecordSeconds?: number;
  audioRecording?: boolean;
  streamType?: "main" | "sub";
}

export interface RecordingScheduleGridProps {
  recorderId?: string;
  channelId?: string;
  onScheduleSaved?: () => void;
  initialSchedule?: Partial<RecordingScheduleData>;
  channelNumber?: number;
  channelName?: string;
  onSave?: (schedule: RecordingScheduleData) => Promise<void>;
  saving?: boolean;
  disabled?: boolean;
}

const DAYS: Array<DailySchedule["day"]> = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const PERIOD_COLORS: Record<RecordingPeriodType, { bg: string; border: string; text: string; label: string }> = {
  CONTINUOUS: {
    bg: "bg-emerald-500/80 hover:bg-emerald-500",
    border: "border-emerald-400/60",
    text: "text-emerald-100",
    label: "Continuous (24h)",
  },
  MOTION: {
    bg: "bg-amber-500/80 hover:bg-amber-500",
    border: "border-amber-400/60",
    text: "text-amber-100",
    label: "Motion Triggered",
  },
  ALARM: {
    bg: "bg-rose-500/80 hover:bg-rose-500",
    border: "border-rose-400/60",
    text: "text-rose-100",
    label: "Alarm / Sensor",
  },
  OFF: {
    bg: "bg-slate-700/60 hover:bg-slate-700",
    border: "border-slate-600",
    text: "text-slate-300",
    label: "Disabled / Off",
  },
};

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function RecordingScheduleGrid({
  recorderId,
  channelId,
  onScheduleSaved,
  initialSchedule,
  channelNumber = 1,
  channelName,
  onSave,
  saving = false,
  disabled = false,
}: RecordingScheduleGridProps) {
  const [internalLoading, setInternalLoading] = useState<boolean>(false);
  const [internalSaving, setInternalSaving] = useState<boolean>(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [internalSuccess, setInternalSuccess] = useState<string | null>(null);

  const [enabled, setEnabled] = useState<boolean>(initialSchedule?.enabled ?? true);
  const [preRecord, setPreRecord] = useState<number>(initialSchedule?.preRecordSeconds ?? 5);
  const [postRecord, setPostRecord] = useState<number>(initialSchedule?.postRecordSeconds ?? 30);
  const [audioRecording, setAudioRecording] = useState<boolean>(initialSchedule?.audioRecording ?? false);
  const [streamType, setStreamType] = useState<"main" | "sub">(initialSchedule?.streamType ?? "main");

  // Build complete 7-day schedule
  const [schedule, setSchedule] = useState<DailySchedule[]>(() => {
    const existing = initialSchedule?.schedule || [];
    return DAYS.map((day) => {
      const match = existing.find((d) => d.day === day);
      if (match && match.periods) {
        return match;
      }
      return {
        day,
        periods: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            type: "CONTINUOUS",
          },
        ],
      };
    });
  });

  const [selectedDay, setSelectedDay] = useState<DailySchedule["day"]>("MONDAY");

  // Preset Handlers
  const apply24x7Continuous = () => {
    setSchedule(
      DAYS.map((day) => ({
        day,
        periods: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            type: "CONTINUOUS",
          },
        ],
      }))
    );
  };

  const applyBusinessHours = () => {
    setSchedule(
      DAYS.map((day) => {
        if (day === "SATURDAY" || day === "SUNDAY") {
          return {
            day,
            periods: [
              {
                startHour: 0,
                startMinute: 0,
                endHour: 24,
                endMinute: 0,
                type: "MOTION",
              },
            ],
          };
        }
        return {
          day,
          periods: [
            { startHour: 0, startMinute: 0, endHour: 9, endMinute: 0, type: "MOTION" },
            { startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, type: "CONTINUOUS" },
            { startHour: 18, startMinute: 0, endHour: 24, endMinute: 0, type: "MOTION" },
          ],
        };
      })
    );
  };

  const applyMotionOnly = () => {
    setSchedule(
      DAYS.map((day) => ({
        day,
        periods: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            type: "MOTION",
          },
        ],
      }))
    );
  };

  const currentDaySchedule = schedule.find((d) => d.day === selectedDay) || {
    day: selectedDay,
    periods: [],
  };

  const handleAddPeriod = () => {
    const last = currentDaySchedule.periods[currentDaySchedule.periods.length - 1];
    const newStartHour = last ? Math.min(last.endHour, 23) : 9;
    const newEndHour = Math.min(newStartHour + 4, 24);

    const updatedPeriods: SchedulePeriod[] = [
      ...currentDaySchedule.periods,
      {
        startHour: newStartHour,
        startMinute: 0,
        endHour: newEndHour,
        endMinute: 0,
        type: "CONTINUOUS",
      },
    ];

    setSchedule((prev) =>
      prev.map((d) => (d.day === selectedDay ? { ...d, periods: updatedPeriods } : d))
    );
  };

  const handleRemovePeriod = (index: number) => {
    const updated = currentDaySchedule.periods.filter((_, i) => i !== index);
    setSchedule((prev) =>
      prev.map((d) => (d.day === selectedDay ? { ...d, periods: updated } : d))
    );
  };

  const handleUpdatePeriod = (index: number, patch: Partial<SchedulePeriod>) => {
    const updated = currentDaySchedule.periods.map((p, i) =>
      i === index ? { ...p, ...patch } : p
    );
    setSchedule((prev) =>
      prev.map((d) => (d.day === selectedDay ? { ...d, periods: updated } : d))
    );
  };

  useEffect(() => {
    if (recorderId && channelId) {
      setInternalLoading(true);
      setInternalError(null);
      deviceConfigurationApi
        .getRecorderSchedule(recorderId, channelId)
        .then((res) => {
          if (res.data) {
            if (res.data.enabled !== undefined) setEnabled(res.data.enabled);
            if (res.data.preRecordSeconds !== undefined) setPreRecord(res.data.preRecordSeconds);
            if (res.data.postRecordSeconds !== undefined) setPostRecord(res.data.postRecordSeconds);
            if (res.data.audioRecording !== undefined) setAudioRecording(res.data.audioRecording);
            if (res.data.streamType) setStreamType(res.data.streamType);
            if (res.data.schedule && Array.isArray(res.data.schedule) && res.data.schedule.length > 0) {
              setSchedule(
                DAYS.map((day) => {
                  const match = res.data.schedule.find((d: any) => d.day === day);
                  return (
                    match || {
                      day,
                      periods: [
                        {
                          startHour: 0,
                          startMinute: 0,
                          endHour: 24,
                          endMinute: 0,
                          type: "CONTINUOUS",
                        },
                      ],
                    }
                  );
                })
              );
            }
          }
        })
        .catch((err) => {
          setInternalError(err?.message || "Failed to load channel recording schedule");
        })
        .finally(() => {
          setInternalLoading(false);
        });
    }
  }, [recorderId, channelId]);

  const handleSubmit = async () => {
    const chNum = channelNumber ?? (parseInt(channelId || "1", 10) || 1);
    const payload: RecordingScheduleData = {
      channelNumber: chNum,
      enabled,
      schedule,
      preRecordSeconds: preRecord,
      postRecordSeconds: postRecord,
      audioRecording,
      streamType,
    };

    if (onSave) {
      await onSave(payload);
    } else if (recorderId && channelId) {
      setInternalSaving(true);
      setInternalError(null);
      setInternalSuccess(null);
      try {
        const res = await deviceConfigurationApi.setRecorderSchedule(recorderId, channelId, payload);
        if (res.data?.success || res.success) {
          setInternalSuccess(`Channel ${channelId} schedule applied and verified on hardware.`);
          if (onScheduleSaved) onScheduleSaved();
        } else {
          setInternalError(res.data?.message || "Applied with verification mismatch.");
        }
      } catch (err: any) {
        setInternalError(err?.message || "Failed to update recording schedule");
      } finally {
        setInternalSaving(false);
      }
    }
  };

  const isSubmitting = saving || internalSaving;

  return (
    <div className="space-y-6">
      {/* Feedback Alerts */}
      {internalError && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{internalError}</span>
        </div>
      )}

      {internalSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{internalSuccess}</span>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={disabled}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
          <div>
            <div className="text-sm font-bold text-slate-100 font-mono">
              CHANNEL {channelNumber} {channelName ? `— ${channelName}` : ""}
            </div>
            <div className="text-xs text-slate-400">
              {enabled ? "Recording active according to schedule" : "Channel recording suspended"}
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={apply24x7Continuous}
            disabled={disabled}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50 transition-colors"
          >
            24/7 Continuous
          </button>
          <button
            type="button"
            onClick={applyBusinessHours}
            disabled={disabled}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-amber-950/60 border border-amber-500/30 text-amber-300 hover:bg-amber-900/50 transition-colors"
          >
            Bank Hours + Motion
          </button>
          <button
            type="button"
            onClick={applyMotionOnly}
            disabled={disabled}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/50 transition-colors"
          >
            Motion Only
          </button>
        </div>
      </div>

      {/* 7-Day Visual Matrix */}
      <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
              7-Day 24-Hour Timeline Matrix
            </h3>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs font-mono">
            {Object.entries(PERIOD_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${color.bg} border ${color.border}`} />
                <span className="text-slate-400">{color.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 24-hour scale header */}
        <div className="grid grid-cols-12 text-[10px] font-mono text-slate-500 pl-24 pr-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="text-center">
              {String(i * 2).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Days Rows */}
        <div className="space-y-2">
          {DAYS.map((day) => {
            const daySched = schedule.find((d) => d.day === day) || { day, periods: [] };
            const isSelected = selectedDay === day;

            return (
              <div
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? "bg-slate-800/80 border border-indigo-500/40 shadow-sm"
                    : "hover:bg-slate-800/40 border border-transparent"
                }`}
              >
                {/* Day Label */}
                <div className="w-20 font-mono text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>{day.slice(0, 3)}</span>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                </div>

                {/* 24h Bar */}
                <div className="relative flex-1 h-8 bg-slate-950 rounded-md border border-slate-800 overflow-hidden flex items-center">
                  {daySched.periods.map((period, idx) => {
                    const startMin = period.startHour * 60 + period.startMinute;
                    const endMin = period.endHour * 60 + period.endMinute;
                    const totalMin = 24 * 60;
                    const leftPct = (startMin / totalMin) * 100;
                    const widthPct = Math.max(((endMin - startMin) / totalMin) * 100, 1);
                    const color = PERIOD_COLORS[period.type];

                    return (
                      <div
                        key={idx}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        className={`absolute top-0 bottom-0 ${color.bg} border-r ${color.border} flex items-center justify-center text-[10px] font-mono font-bold ${color.text} shadow-sm overflow-hidden whitespace-nowrap px-1`}
                        title={`${period.type}: ${formatTime(period.startHour, period.startMinute)} - ${formatTime(period.endHour, period.endMinute)}`}
                      >
                        {widthPct > 10 && `${formatTime(period.startHour, period.startMinute)} - ${formatTime(period.endHour, period.endMinute)}`}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Period Detail & Editor */}
      <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              Schedule Periods: {selectedDay}
            </h4>
          </div>
          <button
            type="button"
            onClick={handleAddPeriod}
            disabled={disabled}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Time Period
          </button>
        </div>

        {currentDaySchedule.periods.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-slate-500">
            No active recording periods configured for {selectedDay}. Channel will not record on this day.
          </div>
        ) : (
          <div className="space-y-3">
            {currentDaySchedule.periods.map((period, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[11px] font-mono font-bold text-slate-300">
                    {idx + 1}
                  </span>

                  {/* Period Type */}
                  <select
                    value={period.type}
                    onChange={(e) =>
                      handleUpdatePeriod(idx, { type: e.target.value as RecordingPeriodType })
                    }
                    disabled={disabled}
                    className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs font-mono font-medium text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CONTINUOUS">CONTINUOUS</option>
                    <option value="MOTION">MOTION</option>
                    <option value="ALARM">ALARM</option>
                    <option value="OFF">OFF</option>
                  </select>

                  {/* Start Time */}
                  <div className="flex items-center gap-1 font-mono text-xs text-slate-400">
                    <span>From:</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={period.startHour}
                      onChange={(e) =>
                        handleUpdatePeriod(idx, { startHour: parseInt(e.target.value, 10) || 0 })
                      }
                      disabled={disabled}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-slate-200"
                    />
                    <span>:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={15}
                      value={period.startMinute}
                      onChange={(e) =>
                        handleUpdatePeriod(idx, { startMinute: parseInt(e.target.value, 10) || 0 })
                      }
                      disabled={disabled}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-slate-200"
                    />
                  </div>

                  {/* End Time */}
                  <div className="flex items-center gap-1 font-mono text-xs text-slate-400">
                    <span>To:</span>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={period.endHour}
                      onChange={(e) =>
                        handleUpdatePeriod(idx, { endHour: parseInt(e.target.value, 10) || 0 })
                      }
                      disabled={disabled}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-slate-200"
                    />
                    <span>:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={15}
                      value={period.endMinute}
                      onChange={(e) =>
                        handleUpdatePeriod(idx, { endMinute: parseInt(e.target.value, 10) || 0 })
                      }
                      disabled={disabled}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemovePeriod(idx)}
                  disabled={disabled}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-900 transition-colors"
                  title="Delete period"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pre/Post Record & Storage Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono">
        <div>
          <label className="block text-slate-400 mb-1">Pre-Record (0–30s):</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={30}
              value={preRecord}
              onChange={(e) => setPreRecord(Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)))}
              disabled={disabled}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
            />
            <span className="text-slate-500">sec</span>
          </div>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Post-Record (5–300s):</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={300}
              value={postRecord}
              onChange={(e) => setPostRecord(Math.max(5, Math.min(300, parseInt(e.target.value, 10) || 5)))}
              disabled={disabled}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
            />
            <span className="text-slate-500">sec</span>
          </div>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Stream Profile:</label>
          <select
            value={streamType}
            onChange={(e) => setStreamType(e.target.value as "main" | "sub")}
            disabled={disabled}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
          >
            <option value="main">Main Stream (High Res)</option>
            <option value="sub">Sub Stream (Low Bandwidth)</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Audio Recording:</label>
          <div className="flex items-center h-8">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={audioRecording}
                onChange={(e) => setAudioRecording(e.target.checked)}
                disabled={disabled}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
              />
              <span className="text-slate-300">{audioRecording ? "Enabled" : "Muted"}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Save Action Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || isSubmitting}
          className="inline-flex items-center px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-lg shadow-emerald-950 transition-all"
        >
          {isSubmitting ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Verifying on Hardware...
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 mr-2" />
              Apply &amp; Verify Schedule
            </>
          )}
        </button>
      </div>
    </div>
  );
}
