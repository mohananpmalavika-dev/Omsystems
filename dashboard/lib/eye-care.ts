/**
 * Sentinel Vision Health & Auto Eye-Care Engine
 * Ergonomic visual protection for operators continuously monitoring the Live Video Wall.
 *
 * Implements:
 * 1. Automatic Circadian Tone Adaptation (Daylight / Dusk / Night Watch / Dawn curve)
 * 2. Continuous Monitoring Fatigue Softening (dynamically softens glare as monitoring session lengthens)
 * 3. Blue-Light Attenuation & Anti-Glare Video Shaders (CSS filter layers)
 * 4. The 20-20-20 Rule Monitoring Rest Intervals (every 20 min look 20 ft away for 20s)
 * 5. Visual Chrome Dimming & Anti-Flicker Alert Mode
 */

export type EyeCareMode = "auto" | "warm" | "night" | "monochrome" | "custom" | "off";

export type CircadianPhase = "DAY" | "DUSK" | "NIGHT_SHIFT" | "DAWN";

export interface EyeCareSettings {
  enabled: boolean;
  mode: EyeCareMode;
  warmth: number; // 0 - 100 (% blue light reduction)
  brightness: number; // 60 - 100 (% luminescent output)
  contrast: number; // 70 - 110 (% glare/contrast softening)
  restReminderIntervalMin: number; // 15, 20 (recommended), 30, 45, 60, or 0 (disabled)
  dimInactiveChrome: boolean; // subdues harsh white UI borders & neon highlights
  antiFlickerAlarms: boolean; // transforms flashing strobes into calm ambient breathing pulses
  soundAlertOnBreak: boolean; // gentle audio chime on rest interval
}

export const DEFAULT_EYE_CARE_SETTINGS: EyeCareSettings = {
  enabled: true,
  mode: "auto",
  warmth: 50,
  brightness: 88,
  contrast: 92,
  restReminderIntervalMin: 20, // 20-20-20 Rule standard
  dimInactiveChrome: true,
  antiFlickerAlarms: true,
  soundAlertOnBreak: true,
};

export const EYE_CARE_STORAGE_KEY = "sentinel.eye-care.settings.v1";
export const EYE_CARE_SESSION_STORAGE_KEY = "sentinel.eye-care.session.v1";

/**
 * Resolves current Circadian phase and base targets based on local hour.
 */
export function getCircadianPhase(hour: number): {
  phase: CircadianPhase;
  label: string;
  recommendedWarmth: number;
  recommendedBrightness: number;
  recommendedContrast: number;
} {
  const normalizedHour = ((hour % 24) + 24) % 24;

  if (normalizedHour >= 7 && normalizedHour < 17) {
    return {
      phase: "DAY",
      label: "Daylight Balanced",
      recommendedWarmth: 15,
      recommendedBrightness: 98,
      recommendedContrast: 98,
    };
  }

  if (normalizedHour >= 17 && normalizedHour < 20) {
    return {
      phase: "DUSK",
      label: "Evening Shift",
      recommendedWarmth: 42,
      recommendedBrightness: 92,
      recommendedContrast: 95,
    };
  }

  if (normalizedHour >= 20 || normalizedHour < 5) {
    return {
      phase: "NIGHT_SHIFT",
      label: "Night Watch",
      recommendedWarmth: 68,
      recommendedBrightness: 84,
      recommendedContrast: 88,
    };
  }

  // 05:00 to 07:00
  return {
    phase: "DAWN",
    label: "Dawn Transition",
    recommendedWarmth: 35,
    recommendedBrightness: 92,
    recommendedContrast: 94,
  };
}

/**
 * Calculates continuous monitoring fatigue boost.
 * Operators staring at feeds for >30 mins experience progressive ciliary strain.
 * Automatically softens harsh glare and increases warmth slightly over time.
 */
export function calculateFatigueCompensation(continuousMonitoringMinutes: number): {
  warmthBoost: number;
  brightnessReduction: number;
  contrastReduction: number;
} {
  if (continuousMonitoringMinutes <= 15) {
    return { warmthBoost: 0, brightnessReduction: 0, contrastReduction: 0 };
  }

  // Increments every 20 minutes of continuous stare
  const intervals = Math.min(4, Math.floor((continuousMonitoringMinutes - 15) / 20));
  return {
    warmthBoost: intervals * 4, // Up to +16% extra warm tone
    brightnessReduction: intervals * 2, // Up to -8% glare reduction
    contrastReduction: intervals * 1.5, // Up to -6% contrast softening
  };
}

export interface EyeCareComputedState {
  filter: string;
  style: React.CSSProperties;
  phaseLabel: string;
  effectiveWarmth: number;
  effectiveBrightness: number;
  effectiveContrast: number;
  fatigueCompensated: boolean;
}

/**
 * Computes the CSS filter and presentation tokens for live wall video feeds.
 */
export function computeEyeCareFilter(
  settings: EyeCareSettings,
  currentHour = new Date().getHours(),
  continuousMonitoringMinutes = 0
): EyeCareComputedState {
  if (!settings.enabled || settings.mode === "off") {
    return {
      filter: "none",
      style: {
        filter: "none",
      },
      phaseLabel: "Eye-Care Off",
      effectiveWarmth: 0,
      effectiveBrightness: 100,
      effectiveContrast: 100,
      fatigueCompensated: false,
    };
  }

  if (settings.mode === "monochrome") {
    return {
      filter: "grayscale(100%) contrast(105%) brightness(90%)",
      style: {
        filter: "grayscale(100%) contrast(105%) brightness(90%)",
      },
      phaseLabel: "High-Acuity Monochrome",
      effectiveWarmth: 0,
      effectiveBrightness: 90,
      effectiveContrast: 105,
      fatigueCompensated: false,
    };
  }

  let baseWarmth = settings.warmth;
  let baseBrightness = settings.brightness;
  let baseContrast = settings.contrast;
  let phaseLabel = "Custom Eye-Care";

  if (settings.mode === "auto") {
    const circadian = getCircadianPhase(currentHour);
    baseWarmth = circadian.recommendedWarmth;
    baseBrightness = circadian.recommendedBrightness;
    baseContrast = circadian.recommendedContrast;
    phaseLabel = `Auto (${circadian.label})`;
  } else if (settings.mode === "warm") {
    baseWarmth = Math.max(50, settings.warmth);
    baseBrightness = Math.min(92, settings.brightness);
    baseContrast = 95;
    phaseLabel = "Warm Amber Blue-Cut";
  } else if (settings.mode === "night") {
    baseWarmth = Math.max(65, settings.warmth);
    baseBrightness = Math.min(82, settings.brightness);
    baseContrast = 88;
    phaseLabel = "Night Watch Anti-Glare";
  }

  // Apply continuous fatigue compensation if active
  const fatigue = calculateFatigueCompensation(continuousMonitoringMinutes);
  const effectiveWarmth = Math.min(95, Math.max(0, baseWarmth + fatigue.warmthBoost));
  const effectiveBrightness = Math.max(65, Math.min(100, baseBrightness - fatigue.brightnessReduction));
  const effectiveContrast = Math.max(70, Math.min(105, baseContrast - fatigue.contrastReduction));

  const sepiaAmount = (effectiveWarmth / 100) * 0.52;
  const hueRotateDeg = -(effectiveWarmth / 100) * 14;
  const saturateAmount = Math.max(0.7, 1 - (effectiveWarmth / 100) * 0.28);
  const brightnessAmount = effectiveBrightness / 100;
  const contrastAmount = effectiveContrast / 100;

  const filterString = `sepia(${sepiaAmount.toFixed(2)}) hue-rotate(${hueRotateDeg.toFixed(1)}deg) saturate(${saturateAmount.toFixed(2)}) brightness(${brightnessAmount.toFixed(2)}) contrast(${contrastAmount.toFixed(2)})`;

  return {
    filter: filterString,
    style: {
      filter: filterString,
      transition: "filter 0.6s ease-in-out",
    },
    phaseLabel,
    effectiveWarmth,
    effectiveBrightness,
    effectiveContrast,
    fatigueCompensated: fatigue.warmthBoost > 0,
  };
}

/**
 * Loads persisted Eye-Care settings from localStorage.
 */
export function loadEyeCareSettings(): EyeCareSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_EYE_CARE_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(EYE_CARE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EYE_CARE_SETTINGS };

    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_EYE_CARE_SETTINGS.enabled,
      mode: ["auto", "warm", "night", "monochrome", "custom", "off"].includes(parsed.mode)
        ? parsed.mode
        : DEFAULT_EYE_CARE_SETTINGS.mode,
      warmth: typeof parsed.warmth === "number" ? Math.min(100, Math.max(0, parsed.warmth)) : DEFAULT_EYE_CARE_SETTINGS.warmth,
      brightness: typeof parsed.brightness === "number" ? Math.min(100, Math.max(60, parsed.brightness)) : DEFAULT_EYE_CARE_SETTINGS.brightness,
      contrast: typeof parsed.contrast === "number" ? Math.min(110, Math.max(70, parsed.contrast)) : DEFAULT_EYE_CARE_SETTINGS.contrast,
      restReminderIntervalMin: typeof parsed.restReminderIntervalMin === "number"
        ? parsed.restReminderIntervalMin
        : DEFAULT_EYE_CARE_SETTINGS.restReminderIntervalMin,
      dimInactiveChrome: typeof parsed.dimInactiveChrome === "boolean"
        ? parsed.dimInactiveChrome
        : DEFAULT_EYE_CARE_SETTINGS.dimInactiveChrome,
      antiFlickerAlarms: typeof parsed.antiFlickerAlarms === "boolean"
        ? parsed.antiFlickerAlarms
        : DEFAULT_EYE_CARE_SETTINGS.antiFlickerAlarms,
      soundAlertOnBreak: typeof parsed.soundAlertOnBreak === "boolean"
        ? parsed.soundAlertOnBreak
        : DEFAULT_EYE_CARE_SETTINGS.soundAlertOnBreak,
    };
  } catch {
    return { ...DEFAULT_EYE_CARE_SETTINGS };
  }
}

/**
 * Saves Eye-Care settings to localStorage.
 */
export function saveEyeCareSettings(settings: EyeCareSettings): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(EYE_CARE_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("sentinel:eye-care:change", { detail: settings }));
  } catch (err) {
    console.warn("[EyeCare] Failed to persist settings", err);
  }
}

/**
 * Formats duration in minutes to user-friendly label (e.g. "45m", "1h 20m").
 */
export function formatMonitoringDuration(totalMinutes: number): string {
  if (totalMinutes < 1) return "< 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
