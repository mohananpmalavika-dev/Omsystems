"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computeEyeCareFilter,
  loadEyeCareSettings,
  saveEyeCareSettings,
  type EyeCareComputedState,
  type EyeCareSettings,
} from "@/lib/eye-care";

/**
 * Plays a gentle, tranquil harmonic chime using Web Audio API.
 * Non-jarring and soothing for visual health micro-breaks.
 */
function playTranquilChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(528, now); // 528 Hz (calming solfeggio frequency)
    osc1.frequency.exponentialRampToValueAtTime(660, now + 0.8);

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(792, now);
    osc2.frequency.exponentialRampToValueAtTime(880, now + 1.2);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.8);
    osc2.stop(now + 1.8);

    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 2500);
  } catch {
    // Ignore audio permission/context errors gracefully
  }
}

export function useEyeCare() {
  const [settings, setSettingsState] = useState<EyeCareSettings>(loadEyeCareSettings);
  const [continuousMinutes, setContinuousMinutes] = useState(0);
  const [showReminderToast, setShowReminderToast] = useState(false);
  const [isMicroBreakActive, setIsMicroBreakActive] = useState(false);
  const [microBreakSecondsLeft, setMicroBreakSecondsLeft] = useState(20);
  const [nowHour, setNowHour] = useState(() => new Date().getHours());

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const secondsCounterRef = useRef(0);
  const breakCountdownTimerRef = useRef<number | null>(null);

  // Sync settings when changed from another window or component
  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<EyeCareSettings>;
      if (customEvent.detail) {
        setSettingsState(customEvent.detail);
      }
    };
    window.addEventListener("sentinel:eye-care:change", handleSync);
    return () => window.removeEventListener("sentinel:eye-care:change", handleSync);
  }, []);

  // Update hour periodically for circadian auto shifting
  useEffect(() => {
    const hourTimer = window.setInterval(() => {
      setNowHour(new Date().getHours());
    }, 60_000);
    return () => window.clearInterval(hourTimer);
  }, []);

  // Continuous monitoring timer (only counts while tab is visible and wall is being viewed)
  useEffect(() => {
    const intervalTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;

      secondsCounterRef.current += 1;
      const totalMins = Math.floor(secondsCounterRef.current / 60);

      setContinuousMinutes(totalMins);

      // Check if 20-20-20 or configured rest interval has elapsed
      const targetInterval = settingsRef.current.restReminderIntervalMin;
      if (
        settingsRef.current.enabled &&
        targetInterval > 0 &&
        secondsCounterRef.current % (targetInterval * 60) === 0
      ) {
        setShowReminderToast(true);
        if (settingsRef.current.soundAlertOnBreak) {
          playTranquilChime();
        }
      }
    }, 1000);

    return () => window.clearInterval(intervalTimer);
  }, []);

  // Update settings handler
  const updateSettings = useCallback((updates: Partial<EyeCareSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      saveEyeCareSettings(next);
      return next;
    });
  }, []);

  // Start 20s Micro-Break (The 20-20-20 Rule rest)
  const startMicroBreak = useCallback(() => {
    setShowReminderToast(false);
    setIsMicroBreakActive(true);
    setMicroBreakSecondsLeft(20);

    if (breakCountdownTimerRef.current) {
      window.clearInterval(breakCountdownTimerRef.current);
    }

    breakCountdownTimerRef.current = window.setInterval(() => {
      setMicroBreakSecondsLeft((prev) => {
        if (prev <= 1) {
          if (breakCountdownTimerRef.current) {
            window.clearInterval(breakCountdownTimerRef.current);
            breakCountdownTimerRef.current = null;
          }
          setIsMicroBreakActive(false);
          // Reset fatigue seconds after successfully taking a 20s rest
          secondsCounterRef.current = 0;
          setContinuousMinutes(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Emergency safety break cancellation (user can resume monitoring immediately with any click or Esc)
  const cancelMicroBreak = useCallback(() => {
    if (breakCountdownTimerRef.current) {
      window.clearInterval(breakCountdownTimerRef.current);
      breakCountdownTimerRef.current = null;
    }
    setIsMicroBreakActive(false);
    setMicroBreakSecondsLeft(20);
  }, []);

  const dismissReminder = useCallback(() => {
    setShowReminderToast(false);
  }, []);

  const snoozeReminder = useCallback((snoozeMinutes = 10) => {
    setShowReminderToast(false);
    // Delay next trigger by setting seconds counter
    const currentInterval = settings.restReminderIntervalMin * 60;
    if (currentInterval > 0) {
      secondsCounterRef.current = Math.max(0, currentInterval - snoozeMinutes * 60);
    }
  }, [settings.restReminderIntervalMin]);

  // Compute live CSS filter with circadian tone and fatigue compensation
  const computed: EyeCareComputedState = useMemo(() => {
    return computeEyeCareFilter(settings, nowHour, continuousMinutes);
  }, [settings, nowHour, continuousMinutes]);

  // Next rest in seconds
  const secondsUntilNextBreak = useMemo(() => {
    const targetInterval = settings.restReminderIntervalMin * 60;
    if (targetInterval <= 0) return 0;
    const elapsedInCycle = secondsCounterRef.current % targetInterval;
    return Math.max(0, targetInterval - elapsedInCycle);
  }, [settings.restReminderIntervalMin, continuousMinutes]);

  return {
    settings,
    computed,
    continuousMinutes,
    secondsUntilNextBreak,
    showReminderToast,
    isMicroBreakActive,
    microBreakSecondsLeft,
    updateSettings,
    startMicroBreak,
    cancelMicroBreak,
    dismissReminder,
    snoozeReminder,
  };
}
