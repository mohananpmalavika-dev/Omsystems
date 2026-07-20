"use client";

import { BookmarkPlus, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import type { Camera, LiveBookmarkReason } from "@/lib/types";

type LiveAction = "bookmark" | "incident";

export function LiveEventForm({
  action,
  camera,
  saving,
  onCancel,
  onSubmit,
}: {
  action: LiveAction;
  camera: Camera;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [bookmarkReason, setBookmarkReason] = useState<LiveBookmarkReason>(
    "suspicious-activity",
  );
  const [bookmarkPriority, setBookmarkPriority] = useState("medium");
  const [incidentPriority, setIncidentPriority] = useState("P3");
  const [preRollSeconds, setPreRollSeconds] = useState("60");
  const [postRollSeconds, setPostRollSeconds] = useState("300");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const occurredAt = new Date().toISOString();
    if (action === "bookmark") {
      await onSubmit({
        bookmarkedAt: occurredAt,
        reason: bookmarkReason,
        priority: bookmarkPriority,
        ...(notes ? { notes } : {}),
      });
      return;
    }
    await onSubmit({
      occurredAt,
      title,
      priority: incidentPriority,
      preRollSeconds: Number(preRollSeconds),
      postRollSeconds: Number(postRollSeconds),
      ...(notes ? { notes } : {}),
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container live-event-modal">
        <div className="modal-header">
          <h2>{action === "bookmark" ? "Bookmark live video" : "Create live incident"}</h2>
          <button className="icon-button" onClick={onCancel}><X size={20} /></button>
        </div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <div className="live-event-camera">
            {action === "bookmark" ? <BookmarkPlus size={18} /> : <ShieldAlert size={18} />}
            <div><strong>{camera.name}</strong><span>{camera.branchName} · channel {camera.channel}</span></div>
          </div>

          {action === "bookmark" ? (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bookmarkReason">Reason</label>
                <select id="bookmarkReason" value={bookmarkReason} onChange={(event) => setBookmarkReason(event.target.value as LiveBookmarkReason)}>
                  <option value="suspicious-activity">Suspicious activity</option>
                  <option value="cash-discrepancy">Cash discrepancy</option>
                  <option value="unauthorized-entry">Unauthorized entry</option>
                  <option value="customer-dispute">Customer dispute</option>
                  <option value="equipment-failure">Equipment failure</option>
                  <option value="safety-incident">Safety incident</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="bookmarkPriority">Priority</label>
                <select id="bookmarkPriority" value={bookmarkPriority} onChange={(event) => setBookmarkPriority(event.target.value)}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="incidentTitle">Incident title <span className="required">*</span></label>
                <input id="incidentTitle" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={160} required placeholder="Suspicious activity at rear entrance" />
              </div>
              <div className="form-row form-row-three">
                <div className="form-group"><label htmlFor="incidentPriority">Priority</label><select id="incidentPriority" value={incidentPriority} onChange={(event) => setIncidentPriority(event.target.value)}><option value="P1">P1 · Critical</option><option value="P2">P2 · High</option><option value="P3">P3 · Medium</option><option value="P4">P4 · Low</option><option value="P5">P5 · Information</option></select></div>
                <div className="form-group"><label htmlFor="preRoll">Video before event</label><select id="preRoll" value={preRollSeconds} onChange={(event) => setPreRollSeconds(event.target.value)}><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="120">2 minutes</option></select></div>
                <div className="form-group"><label htmlFor="postRoll">Video after event</label><select id="postRoll" value={postRollSeconds} onChange={(event) => setPostRollSeconds(event.target.value)}><option value="60">1 minute</option><option value="180">3 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option></select></div>
              </div>
              <div className="form-info-banner"><ShieldAlert size={16} />The selected recording window will be placed on legal hold automatically.</div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="liveEventNotes">Operator notes</label>
            <textarea id="liveEventNotes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} placeholder="Describe what you observed…" />
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
            <button className="primary-button" disabled={saving}>
              {saving ? "Saving…" : action === "bookmark" ? "Save bookmark" : "Create & protect recording"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
