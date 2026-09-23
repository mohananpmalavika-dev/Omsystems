"use client";

import React, { useState } from "react";
import {
  Tag,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  useCameraOperatorFlags,
  PREDEFINED_OPERATOR_FLAGS,
  OperatorFlagType,
  OperatorCameraFlag,
} from "@/lib/camera-operator-flags";

interface OperatorCameraFlagModalProps {
  cameraId: string;
  cameraName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function OperatorCameraFlagModal({
  cameraId,
  cameraName,
  isOpen,
  onClose,
}: OperatorCameraFlagModalProps) {
  const { cameraFlags, toggleFlag, updateFlags } = useCameraOperatorFlags(cameraId);
  const [customTagInput, setCustomTagInput] = useState("");
  const [customNote, setCustomNote] = useState("");

  if (!isOpen) return null;

  const handleAddCustomFlag = () => {
    const trimmed = customTagInput.trim();
    if (!trimmed) return;
    const newFlag: OperatorCameraFlag = {
      type: "custom",
      label: trimmed,
      note: customNote.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    updateFlags([...cameraFlags, newFlag]);
    setCustomTagInput("");
    setCustomNote("");
  };

  const handleRemoveFlag = (index: number) => {
    const updated = cameraFlags.filter((_, idx) => idx !== index);
    updateFlags(updated);
  };

  const handleClearAll = () => {
    updateFlags([]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-2xl p-5 text-zinc-100 flex flex-col gap-4 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Tag size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                Operator Status Badges
              </h3>
              <p className="text-xs text-zinc-400 truncate max-w-[260px]">
                {cameraName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Predefined Flags */}
        <div>
          <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
            Quick Status Badges
          </label>
          <div className="grid grid-cols-1 gap-2">
            {PREDEFINED_OPERATOR_FLAGS.map((flag) => {
              const isActive = cameraFlags.some((f) => f.type === flag.type);
              return (
                <button
                  key={flag.type}
                  type="button"
                  onClick={() => toggleFlag(flag.type)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    isActive
                      ? "bg-zinc-800/90 border-sky-500/80 shadow-[0_0_12px_rgba(14,165,233,0.2)]"
                      : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{flag.icon}</span>
                    <div>
                      <span className="font-semibold block text-zinc-200">
                        {flag.label}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {flag.description}
                      </span>
                    </div>
                  </div>
                  {isActive ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-sky-400">
                      <CheckCircle2 size={15} /> Active
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-500 font-medium">
                      + Add
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Add Custom Flag */}
        <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col gap-2">
          <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
            <Sparkles size={12} className="text-indigo-400" />
            Custom Note or Badge
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Broken Lock, VIP Gate 2..."
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomFlag();
                }
              }}
              className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleAddCustomFlag}
              disabled={!customTagInput.trim()}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {/* Currently Applied Flags Summary */}
        {cameraFlags.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>Active Badges ({cameraFlags.length})</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cameraFlags.map((flag, idx) => {
                const def = PREDEFINED_OPERATOR_FLAGS.find((f) => f.type === flag.type);
                const colorClass = def
                  ? def.colorClass
                  : "bg-indigo-500/20 text-indigo-300 border-indigo-500/60";
                return (
                  <span
                    key={`${flag.type}-${idx}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${colorClass}`}
                  >
                    <span>{def ? def.icon : "🏷️"}</span>
                    <span>{flag.label}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFlag(idx)}
                      className="ml-0.5 text-zinc-400 hover:text-white"
                      title="Remove flag"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
