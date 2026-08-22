import { useEffect, useState } from "react";
import { clampDecoderLimit, DECODER_CAPACITY_OPTIONS } from "./enhanced-camera-grid-model";

export type DecoderBudget = {
  maxActiveDecoders: number;
  currentActiveDecoders: number;
  estimatedDecodeClass: "LOW" | "STANDARD" | "HIGH" | "VIDEO_WALL";
  preferredCodec: "H264" | "H265" | "AUTO";
};

interface UseDecoderBudgetArgs {
  maxConcurrentStreams: number;
  enableGPUAcceleration?: boolean;
  storedPreferenceKey?: string;
  initialPreference?: number;
}

export function useDecoderBudgetManager({
  maxConcurrentStreams,
  enableGPUAcceleration = true,
  storedPreferenceKey = "sentinel.decoderCapacity",
  initialPreference,
}: UseDecoderBudgetArgs) {
  const [preference, setPreference] = useState<number | undefined>(() => {
    try {
      const stored = window?.localStorage?.getItem(storedPreferenceKey);
      if (stored) return Number(stored);
    } catch (e) {
      // ignore
    }
    return initialPreference;
  });

  const [decoderBudget, setDecoderBudget] = useState<DecoderBudget>(() => {
    // conservative default
    const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
    const decodeClass = cores >= 16 ? "VIDEO_WALL" : cores >= 8 ? "HIGH" : cores >= 4 ? "STANDARD" : "LOW";
    // seed logical default
    const base = decodeClass === "VIDEO_WALL" ? 144 : decodeClass === "HIGH" ? 64 : decodeClass === "STANDARD" ? 36 : 16;
    const gpuFactor = enableGPUAcceleration ? 1.25 : 1.0;
    const capped = clampDecoderLimit(Math.floor(base * gpuFactor), maxConcurrentStreams);
    return { maxActiveDecoders: capped, currentActiveDecoders: 0, estimatedDecodeClass: decodeClass, preferredCodec: "AUTO" };
  });

  // Recompute budget when maxConcurrentStreams or GPU preference changes
  useEffect(() => {
    const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
    const decodeClass = cores >= 16 ? "VIDEO_WALL" : cores >= 8 ? "HIGH" : cores >= 4 ? "STANDARD" : "LOW";
    const base = decodeClass === "VIDEO_WALL" ? 144 : decodeClass === "HIGH" ? 64 : decodeClass === "STANDARD" ? 36 : 16;
    const gpuFactor = enableGPUAcceleration ? 1.25 : 1.0;
    let computed = clampDecoderLimit(Math.floor(base * gpuFactor), maxConcurrentStreams);
    if (preference) {
      // user preference must respect maxConcurrentStreams
      computed = clampDecoderLimit(preference, maxConcurrentStreams);
    }
    setDecoderBudget((prev) => ({ ...prev, maxActiveDecoders: computed, estimatedDecodeClass: decodeClass }));
  }, [maxConcurrentStreams, enableGPUAcceleration, preference]);

  const setUserPreference = (value: number) => {
    const clamped = clampDecoderLimit(value, maxConcurrentStreams);
    setPreference(clamped);
    try {
      window?.localStorage?.setItem(storedPreferenceKey, String(clamped));
    } catch (e) {
      // ignore
    }
    setDecoderBudget((prev) => ({ ...prev, maxActiveDecoders: clamped }));
  };

  const setActiveCount = (count: number) => setDecoderBudget((prev) => ({ ...prev, currentActiveDecoders: count }));

  return {
    decoderBudget,
    decoderLimit: decoderBudget.maxActiveDecoders,
    setUserPreference,
    setActiveCount,
    DECODER_CAPACITY_OPTIONS,
  };
}
