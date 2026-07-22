"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import type { Camera as CameraType, RecordingJob } from "@/lib/types";

type RecordingSettingsPanelProps = {
  cameras: CameraType[];
  selectedCameraId?: string | null;
  recording?: RecordingJob;
  saving?: boolean;
  onSelectCamera: (cameraId: string) => void;
  onToggleRecording: (cameraId: string) => void;
  onSave: (cameraId: string, update: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">>) => Promise<void>;
};

const defaultSchedule = {
  timezone: "UTC",
  windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", enabled: true }],
};

export function RecordingSettingsPanel({
  cameras,
  selectedCameraId,
  recording,
  saving,
  onSelectCamera,
  onToggleRecording,
  onSave,
}: RecordingSettingsPanelProps) {
  const selectedCamera = cameras.find((camera) => camera.id === selectedCameraId);
  const [mode, setMode] = useState<RecordingJob["mode"]>(recording?.mode ?? "continuous");
  const [enabled, setEnabled] = useState(recording?.enabled ?? false);
  const [preRollSeconds, setPreRollSeconds] = useState(recording?.preRollSeconds ?? 30);
  const [postRollSeconds, setPostRollSeconds] = useState(recording?.postRollSeconds ?? 30);
  const [minMotionDuration, setMinMotionDuration] = useState(recording?.minMotionDurationSeconds ?? 5);
  const [motionConfidence, setMotionConfidence] = useState(
    recording?.motionConfidenceThreshold != null ? String(Math.round(recording.motionConfidenceThreshold * 100)) : "40",
  );
  const [cooldownSeconds, setCooldownSeconds] = useState(recording?.cooldownSeconds ?? 30);
  const [maxEventDurationSeconds, setMaxEventDurationSeconds] = useState(recording?.maxEventDurationSeconds ?? 600);
  const [triggerEventTypes, setTriggerEventTypes] = useState((recording?.triggerEventTypes ?? ["motion", "tamper"]).join(", "));
  const [scheduleDays, setScheduleDays] = useState<number[]>(recording?.schedule?.windows?.[0]?.days ?? [1, 2, 3, 4, 5]);
  const [scheduleStart, setScheduleStart] = useState(recording?.schedule?.windows?.[0]?.start ?? "09:00");
  const [scheduleEnd, setScheduleEnd] = useState(recording?.schedule?.windows?.[0]?.end ?? "18:00");

  useEffect(() => {
    setMode(recording?.mode ?? "continuous");
    setEnabled(recording?.enabled ?? false);
    setPreRollSeconds(recording?.preRollSeconds ?? 30);
    setPostRollSeconds(recording?.postRollSeconds ?? 30);
    setMinMotionDuration(recording?.minMotionDurationSeconds ?? 5);
    setMotionConfidence(
      recording?.motionConfidenceThreshold != null ? String(Math.round(recording.motionConfidenceThreshold * 100)) : "40",
    );
    setCooldownSeconds(recording?.cooldownSeconds ?? 30);
    setMaxEventDurationSeconds(recording?.maxEventDurationSeconds ?? 600);
    setTriggerEventTypes((recording?.triggerEventTypes ?? ["motion", "tamper"]).join(", "));
    setScheduleDays(recording?.schedule?.windows?.[0]?.days ?? [1, 2, 3, 4, 5]);
    setScheduleStart(recording?.schedule?.windows?.[0]?.start ?? "09:00");
    setScheduleEnd(recording?.schedule?.windows?.[0]?.end ?? "18:00");
  }, [recording?.cameraId, recording]);

  const toggleScheduleDay = (day: number) => {
    setScheduleDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b),
    );
  };

  const handleSave = async () => {
    if (!selectedCamera) return;

    const update: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">> = {
      mode,
      enabled,
      preRollSeconds,
      postRollSeconds,
    };

    if (mode === "motion") {
      update.minMotionDurationSeconds = minMotionDuration;
      update.motionConfidenceThreshold = Number(motionConfidence) / 100;
      update.cooldownSeconds = cooldownSeconds;
    }

    if (mode === "scheduled") {
      update.schedule = {
        timezone: defaultSchedule.timezone,
        windows: [
          {
            days: scheduleDays,
            start: scheduleStart,
            end: scheduleEnd,
            enabled: true,
          },
        ],
      };
    }

    if (mode === "event") {
      update.maxEventDurationSeconds = maxEventDurationSeconds;
      update.triggerEventTypes = triggerEventTypes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }

    await onSave(selectedCamera.id, update);
  };

  return (
    <aside className="recording-settings-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">RECORDING SETTINGS</span>
          <h3>Camera recording workspace</h3>
          <p>Configure recording mode, retention triggers, and protection parameters for one camera at a time.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => selectedCamera && onToggleRecording(selectedCamera.id)}
          disabled={!selectedCamera || saving}
        >
          {recording?.enabled ? "Stop recording" : "Start recording"}
        </button>
      </div>

      <div className="panel-body">
        <div className="form-group">
          <label htmlFor="settingsCamera">Camera</label>
          <select
            id="settingsCamera"
            value={selectedCamera?.id ?? ""}
            onChange={(event) => onSelectCamera(event.target.value)}
            disabled={saving}
          >
            <option value="">Select camera...</option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name} ({camera.branchName ?? camera.branchId})
              </option>
            ))}
          </select>
        </div>

        {!selectedCamera ? (
          <div className="recording-empty">
            <CheckCircle2 size={28} />
            <strong>Select a camera to manage recording settings.</strong>
            <span>Use the tile controls or the camera selector above to adjust how footage is captured.</span>
          </div>
        ) : (
          <>
            <div className="settings-summary">
              <div>
                <small>Status</small>
                <strong>{recording?.status ?? "disabled"}</strong>
              </div>
              <div>
                <small>Mode</small>
                <strong>{mode}</strong>
              </div>
              <div>
                <small>Retention</small>
                <strong>{recording?.retentionDays ?? 180} days</strong>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="settingsEnabled">Recording enabled</label>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEnabled((current) => !current)}
                disabled={saving}
              >
                {enabled ? "Enabled" : "Paused"}
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="settingsMode">Recording mode</label>
              <select
                id="settingsMode"
                value={mode}
                onChange={(event) => setMode(event.target.value as RecordingJob["mode"])}
                disabled={saving}
              >
                <option value="continuous">Continuous</option>
                <option value="motion">Motion</option>
                <option value="scheduled">Scheduled</option>
                <option value="event">Event</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="settingsPreRoll">Pre-roll (seconds)</label>
                <input
                  id="settingsPreRoll"
                  type="number"
                  min={0}
                  max={3600}
                  value={preRollSeconds}
                  onChange={(event) => setPreRollSeconds(Number(event.target.value))}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label htmlFor="settingsPostRoll">Post-roll (seconds)</label>
                <input
                  id="settingsPostRoll"
                  type="number"
                  min={0}
                  max={3600}
                  value={postRollSeconds}
                  onChange={(event) => setPostRollSeconds(Number(event.target.value))}
                  disabled={saving}
                />
              </div>
            </div>

            {mode === "motion" && (
              <>
                <div className="form-group">
                  <label htmlFor="settingsMinMotionDuration">Minimum motion duration</label>
                  <input
                    id="settingsMinMotionDuration"
                    type="number"
                    min={0}
                    max={86400}
                    value={minMotionDuration}
                    onChange={(event) => setMinMotionDuration(Number(event.target.value))}
                    disabled={saving}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="settingsMotionConfidence">Motion confidence (%)</label>
                    <input
                      id="settingsMotionConfidence"
                      type="number"
                      min={0}
                      max={100}
                      value={motionConfidence}
                      onChange={(event) => setMotionConfidence(event.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="settingsCooldownSeconds">Cooldown (seconds)</label>
                    <input
                      id="settingsCooldownSeconds"
                      type="number"
                      min={0}
                      max={86400}
                      value={cooldownSeconds}
                      onChange={(event) => setCooldownSeconds(Number(event.target.value))}
                      disabled={saving}
                    />
                  </div>
                </div>
              </>
            )}

            {mode === "scheduled" && (
              <>
                <div className="form-group">
                  <label>Schedule days</label>
                  <div className="checkbox-grid">
                    {[
                      { label: "Sun", value: 0 },
                      { label: "Mon", value: 1 },
                      { label: "Tue", value: 2 },
                      { label: "Wed", value: 3 },
                      { label: "Thu", value: 4 },
                      { label: "Fri", value: 5 },
                      { label: "Sat", value: 6 },
                    ].map((option) => (
                      <label key={option.value}>
                        <input
                          type="checkbox"
                          checked={scheduleDays.includes(option.value)}
                          onChange={() => toggleScheduleDay(option.value)}
                          disabled={saving}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="settingsScheduleStart">Starts at</label>
                    <input
                      id="settingsScheduleStart"
                      type="time"
                      value={scheduleStart}
                      onChange={(event) => setScheduleStart(event.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="settingsScheduleEnd">Ends at</label>
                    <input
                      id="settingsScheduleEnd"
                      type="time"
                      value={scheduleEnd}
                      onChange={(event) => setScheduleEnd(event.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
              </>
            )}

            {mode === "event" && (
              <>
                <div className="form-group">
                  <label htmlFor="settingsMaxEventDurationSeconds">Max event duration (seconds)</label>
                  <input
                    id="settingsMaxEventDurationSeconds"
                    type="number"
                    min={0}
                    max={86400}
                    value={maxEventDurationSeconds}
                    onChange={(event) => setMaxEventDurationSeconds(Number(event.target.value))}
                    disabled={saving}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="settingsTriggerEventTypes">Trigger event types</label>
                  <input
                    id="settingsTriggerEventTypes"
                    type="text"
                    value={triggerEventTypes}
                    onChange={(event) => setTriggerEventTypes(event.target.value)}
                    placeholder="motion, tamper"
                    disabled={saving}
                  />
                </div>
              </>
            )}

            <div className="panel-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  if (recording?.cameraId) {
                    onSelectCamera(recording.cameraId);
                  }
                }}
                disabled={!selectedCamera || saving}
              >
                Reset values
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSave}
                disabled={!selectedCamera || saving}
              >
                {saving ? "Saving…" : "Save recording settings"}
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
