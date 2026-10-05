"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { cameraApi } from "@/lib/api-client";
import type { Camera } from "@/lib/types";

// Values follow the existing camera installation types in the control plane.
export const CAMERA_LOCATIONS = [
  ["strong-room", "Cash room / Strong room"],
  ["vault", "Vault"],
  ["branch-entrance", "Entrance"],
  ["branch-exit", "Exit"],
  ["cash-counter", "Cash counter"],
  ["teller-area", "Teller area"],
  ["lobby", "Lobby"],
  ["manager-cabin", "Manager cabin"],
  ["locker-room", "Locker room"],
  ["safe-deposit", "Safe deposit"],
  ["atm-cabin", "ATM cabin"],
  ["parking-area", "Parking area"],
  ["perimeter-fence", "Perimeter"],
  ["staircase", "Staircase"],
  ["corridor", "Corridor"],
  ["server-room", "Server room"],
  ["other", "Other"],
] as const;

export function CameraLocationEditor({ camera, onSaved }: {
  camera: Camera;
  onSaved: (cameraId: string, locationType: string) => void;
}) {
  const [draft, setDraft] = useState<{ original?: string; value: string }>();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const location = draft && draft.original === camera.locationType ? draft.value : camera.locationType ?? "";
  const knownLocation = CAMERA_LOCATIONS.some(([value]) => value === location);

  async function save() {
    if (saving || !knownLocation || location === camera.locationType) return;
    setSaving(true);
    setFeedback(undefined);
    try {
      const updated = await cameraApi.updateLocation(camera.id, location);
      onSaved(camera.id, updated.locationType);
      setDraft(undefined);
      const label = CAMERA_LOCATIONS.find(([value]) => value === updated.locationType)?.[1] ?? updated.locationType;
      setFeedback({ error: false, text: `Location updated to ${label}.` });
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "Could not update the camera location. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return <section className="los-location-editor" aria-label="Camera location settings" aria-busy={saving}>
    <label><span><MapPin size={15} aria-hidden="true" />Camera location</span>
      <select aria-label="Camera location" value={location} disabled={saving} onChange={event => {
        setDraft({ original: camera.locationType, value: event.target.value });
        setFeedback(undefined);
      }}>
        <option value="" disabled>Select location</option>
        {location && !knownLocation && <option value={location} disabled>{location}</option>}
        {CAMERA_LOCATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <button type="button" disabled={saving || !knownLocation || location === camera.locationType} onClick={() => void save()}>{saving ? "Updating…" : "Update"}</button>
    {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "los-location-feedback error" : "los-location-feedback"}>{feedback.text}</p>}
  </section>;
}
