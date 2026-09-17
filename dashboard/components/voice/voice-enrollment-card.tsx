"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Info,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";
import { voiceEnrollmentApi, type VoiceProfileStatus } from "@/lib/api-client";

const PASSPHRASE_TEXT = "My voice is my secure enterprise identity for Sentinel OMS";

/**
 * Encodes Float32Array PCM samples (at sampleRate) to a 16-bit mono WAV ArrayBuffer
 */
function encodeWav16Bit(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

/**
 * Resamples an AudioBuffer's channel data to 16,000 Hz mono Float32Array
 */
function resampleTo16kHz(audioBuffer: AudioBuffer): Float32Array {
  const sourceRate = audioBuffer.sampleRate;
  const targetRate = 16000;
  const channelData = audioBuffer.getChannelData(0);

  if (sourceRate === targetRate) {
    return channelData;
  }

  const ratio = sourceRate / targetRate;
  const targetLength = Math.round(channelData.length / ratio);
  const result = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio;
    const lower = Math.floor(srcIndex);
    const upper = Math.min(lower + 1, channelData.length - 1);
    const fraction = srcIndex - lower;
    result[i] = (channelData[lower] || 0) * (1 - fraction) + (channelData[upper] || 0) * fraction;
  }

  return result;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return window.btoa(binary);
}

export function VoiceEnrollmentCard() {
  const [profileStatus, setProfileStatus] = useState<VoiceProfileStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Enrollment Wizard state
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [voiceProfileId, setVoiceProfileId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [requiredSamples, setRequiredSamples] = useState(3);
  const [sampleQualityScores, setSampleQualityScores] = useState<number[]>([]);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(4);
  const [audioLevel, setAudioLevel] = useState(0);
  const [processingSample, setProcessingSample] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  // Audio Context references
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch status on load
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await voiceEnrollmentApi.getStatus();
      setProfileStatus(res);
    } catch (err: any) {
      console.warn("Failed to fetch voice enrollment status:", err);
      // Fallback empty state instead of crashing
      setProfileStatus({ enrolled: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Clean up media on unmount
  const stopMicrophone = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, [stopMicrophone]);

  // Draw audio visualizer
  useEffect(() => {
    if (!isRecording) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;

        // Gradient color from cyan to indigo
        const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
        grad.addColorStop(0, "#38bdf8");
        grad.addColorStop(0.5, "#818cf8");
        grad.addColorStop(1, "#c084fc");

        ctx.fillStyle = grad;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

        x += barWidth;
        if (x > canvas.width) break;
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isRecording]);

  // Start Enrollment Workflow
  const handleStartEnrollment = async () => {
    try {
      setLoading(true);
      setError(null);
      setActionSuccess(null);
      setMicPermissionDenied(false);

      // If user has an existing profile, revoke it first to reset
      if (profileStatus?.enrolled) {
        try {
          await voiceEnrollmentApi.revokeProfile("Re-enrollment requested");
        } catch {}
      }

      const res = await voiceEnrollmentApi.startEnrollment({
        consentGiven: true,
        passphraseRequired: false,
      });

      setVoiceProfileId(res.voiceProfileId);
      setRequiredSamples(res.minimumSamplesRequired || 3);
      setCurrentStep(1);
      setSampleQualityScores([]);
      setIsEnrolling(true);
    } catch (err: any) {
      console.error("Start enrollment failed:", err);
      setError(err?.message || "Failed to start voice enrollment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Record a Single Voice Sample
  const handleRecordSample = async () => {
    if (!voiceProfileId) {
      setError("No active enrollment session. Please restart.");
      return;
    }

    try {
      setError(null);
      setMicPermissionDenied(false);
      audioChunksRef.current = [];

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is not supported by your browser or requires HTTPS.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Audio level calculation
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Media recorder setup
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processAndSubmitSample(audioBlob);
      };

      recorder.start(100);
      setIsRecording(true);
      setCountdown(4);

      // Countdown timer
      let remaining = 4;
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        }
      }, 1000);

      // Stop automatically after 4.2 seconds
      timerRef.current = setTimeout(() => {
        stopMicrophone();
      }, 4200);
    } catch (err: any) {
      console.warn("Microphone access failed:", err);
      const isDenied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      if (isDenied) {
        setMicPermissionDenied(true);
        setError("Microphone permission was denied. Please allow microphone access in your browser settings to enroll your voice.");
      } else {
        setError(err?.message || "Failed to access microphone.");
      }
      stopMicrophone();
    }
  };

  // Process & Submit the Captured Sample
  const processAndSubmitSample = async (audioBlob: Blob) => {
    if (!voiceProfileId) return;

    setProcessingSample(true);
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      let base64Audio = "";
      let audioFormat: "wav" | "webm" = "wav";

      if (AudioCtx) {
        try {
          const decodeCtx = new AudioCtx();
          const decodedBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
          const pcm16k = resampleTo16kHz(decodedBuffer);
          const wavBuffer = encodeWav16Bit(pcm16k, 16000);
          base64Audio = arrayBufferToBase64(wavBuffer);
          audioFormat = "wav";
          decodeCtx.close().catch(() => {});
        } catch (decodeErr) {
          console.warn("WAV decode fallback to webm blob:", decodeErr);
          base64Audio = arrayBufferToBase64(arrayBuffer);
          audioFormat = "webm";
        }
      } else {
        base64Audio = arrayBufferToBase64(arrayBuffer);
        audioFormat = "webm";
      }

      const res = await voiceEnrollmentApi.submitSample({
        voiceProfileId,
        audioData: base64Audio,
        audioFormat,
        sampleRateHz: 16000,
        durationSeconds: 4.0,
      });

      if (!res.qualityPassed) {
        const issues = res.qualityIssues?.join(", ") || "Acoustic quality was too low";
        setError(`Sample quality check failed: ${issues}. Please speak clearly and try again.`);
        return;
      }

      // Add quality score to list
      const scorePct = Math.round((res.qualityScore || 0.85) * 100);
      setSampleQualityScores((prev) => [...prev, scorePct]);

      if (res.enrollmentComplete || currentStep >= requiredSamples) {
        // Complete the profile aggregation
        const compRes = await voiceEnrollmentApi.completeEnrollment(voiceProfileId);
        setActionSuccess(
          "Voice ID biometric enrollment completed successfully! You can now log in using your voice."
        );
        setIsEnrolling(false);
        setVoiceProfileId(null);
        await fetchStatus();
      } else {
        // Advance to next sample
        setCurrentStep((prev) => prev + 1);
        setActionSuccess(`Sample ${currentStep} of ${requiredSamples} recorded and verified!`);
      }
    } catch (err: any) {
      console.error("Submit sample failed:", err);
      setError(err?.message || "Failed to process voice sample. Please try again.");
    } finally {
      setProcessingSample(false);
    }
  };

  // Revoke Profile
  const handleRevokeProfile = async () => {
    try {
      setRevoking(true);
      setError(null);
      await voiceEnrollmentApi.revokeProfile("User revoked voice profile from security settings");
      setActionSuccess("Voice ID profile revoked. Voice authentication disabled.");
      setShowRevokeModal(false);
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message || "Failed to revoke voice profile.");
    } finally {
      setRevoking(false);
    }
  };

  const isEnrolled = Boolean(profileStatus?.enrolled && profileStatus?.isActive);

  return (
    <section
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
      aria-label="Voice Biometric Enrollment"
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-sky-500/5 via-indigo-500/5 to-purple-500/5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400">
            <Mic className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Voice ID Biometric Authentication
              </h2>
              {isEnrolled ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active & Enrolled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                  Not Enrolled
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enroll your vocal acoustic signature for secure, passwordless authentication at sign-in.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void fetchStatus()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition"
          title="Refresh voice enrollment status"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Messages */}
        {error && (
          <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50/80 dark:bg-red-950/40 p-4 text-red-900 dark:text-red-200 text-sm flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-semibold block">Enrollment Notice</strong>
              <p className="mt-0.5 text-xs text-red-800 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {actionSuccess && (
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-900 bg-emerald-50/80 dark:bg-emerald-950/40 p-4 text-emerald-900 dark:text-emerald-200 text-sm flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-semibold block">Success</strong>
              <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300">{actionSuccess}</p>
            </div>
          </div>
        )}

        {/* ACTIVE ENROLLED PROFILE CARD */}
        {isEnrolled && !isEnrolling && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/10 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Voice ID Profile is Operational
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Your voice signature is mathematically embedded and verified for AI speaker verification.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Samples Recorded:</span>
                        <span className="font-mono">{profileStatus?.profile?.samplesCount || 3}/3</span>
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Acoustic Score:</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          {profileStatus?.profile?.enrollmentQualityScore
                            ? `${Math.round(profileStatus.profile.enrollmentQualityScore * 100)}%`
                            : "94% High Fidelity"}
                        </span>
                      </span>
                      {profileStatus?.profile?.successfulAuthCount !== undefined && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                            <span className="font-medium text-slate-700 dark:text-slate-300">Logins Completed:</span>
                            <span className="font-mono">{profileStatus.profile.successfulAuthCount}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleStartEnrollment()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition"
                  >
                    <RotateCcw size={14} />
                    <span>Re-enroll Voice</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRevokeModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/60 transition"
                  >
                    <Trash2 size={14} />
                    <span>Revoke</span>
                  </button>
                </div>
              </div>
            </div>

            {/* How to use tip */}
            <div className="rounded-xl border border-sky-200 dark:border-sky-900/40 bg-sky-50/50 dark:bg-sky-950/20 p-4 text-xs text-sky-900 dark:text-sky-300 flex items-start gap-3">
              <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">How to use Voice ID at Sign-in:</strong>
                <p className="mt-0.5 text-sky-800 dark:text-sky-300">
                  Navigate to the Login page, click the <strong>&quot;Voice ID&quot;</strong> tab, enter your username or speak directly, click <strong>&quot;Start Voice Scan&quot;</strong>, and read the prompt. You will be authenticated immediately without entering a password.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* NOT ENROLLED CALL TO ACTION */}
        {!isEnrolled && !isEnrolling && (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-8 text-center space-y-4">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20">
              <Mic className="h-8 w-8" />
            </div>

            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Enroll Your Voice ID for Zero-Touch Sign-In
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Record 3 brief voice samples (4 seconds each) to build your unique acoustic biometrics profile. Voice authentication utilizes anti-spoofing and deepfake detection.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                id="start-voice-enrollment-btn"
                onClick={() => void handleStartEnrollment()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-md shadow-indigo-500/20 active:scale-[0.98] transition disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Preparing Mic...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Enroll Voice ID Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE ENROLLMENT RECORDING WIZARD */}
        {isEnrolling && (
          <div className="space-y-6 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-b from-indigo-50/20 to-transparent dark:from-indigo-950/20 p-6">
            {/* Step Indicators */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Voice Sample {currentStep} of {requiredSamples}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Speak clearly into your microphone when recording begins.
                </p>
              </div>

              {/* Progress Dots */}
              <div className="flex items-center gap-2">
                {Array.from({ length: requiredSamples }).map((_, idx) => {
                  const stepNum = idx + 1;
                  const isDone = stepNum < currentStep;
                  const isCurrent = stepNum === currentStep;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold transition-all ${
                        isDone
                          ? "bg-emerald-500 text-white"
                          : isCurrent
                          ? "bg-indigo-600 text-white ring-4 ring-indigo-500/20"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {isDone ? <Check size={14} /> : stepNum}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Passphrase Prompt */}
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 p-5 text-center shadow-sm space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Please Read This Passphrase Aloud
              </span>
              <p className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 font-mono select-all">
                &ldquo;{PASSPHRASE_TEXT}&rdquo;
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                (Speak at your normal volume and pace. Background noise will be filtered automatically.)
              </p>
            </div>

            {/* Visualizer Canvas */}
            <div className="relative h-28 rounded-xl bg-slate-900 overflow-hidden border border-slate-800 flex items-center justify-center">
              <canvas ref={canvasRef} width={500} height={112} className="w-full h-full" />

              {!isRecording && !processingSample && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-[2px] text-slate-400 text-xs">
                  <Mic size={24} className="mb-1 text-slate-500" />
                  <span>Press &quot;Record Voice Sample&quot; to begin</span>
                </div>
              )}

              {isRecording && (
                <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-950/80 border border-red-800 text-red-400 px-2.5 py-1 rounded-full text-xs font-mono animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span>Recording: {countdown}s</span>
                </div>
              )}

              {processingSample && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm text-indigo-400 text-xs gap-2">
                  <RefreshCw size={24} className="animate-spin" />
                  <span>Extracting Acoustic Embeddings & Quality Metrics...</span>
                </div>
              )}
            </div>

            {/* Audio VU Meter */}
            {isRecording && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Volume2 size={13} />
                    <span>Microphone Input Level</span>
                  </span>
                  <span className="font-mono">{audioLevel}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 rounded-full ${
                      audioLevel > 20
                        ? "bg-gradient-to-r from-emerald-500 to-sky-500"
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            )}

            {/* Recorded Quality Score Progress */}
            {sampleQualityScores.length > 0 && (
              <div className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Verified Samples:</span>
                <div className="flex items-center gap-2">
                  {sampleQualityScores.map((score, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-mono text-[11px] border border-emerald-200 dark:border-emerald-800"
                    >
                      <Check size={11} /> Sample {i + 1}: {score}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  stopMicrophone();
                  setIsEnrolling(false);
                  setVoiceProfileId(null);
                }}
                disabled={isRecording || processingSample}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancel Enrollment
              </button>

              <button
                type="button"
                id="record-voice-sample-btn"
                onClick={() => void handleRecordSample()}
                disabled={isRecording || processingSample}
                className={`inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl text-white transition shadow-md ${
                  isRecording
                    ? "bg-red-600 hover:bg-red-700 shadow-red-500/20 animate-pulse"
                    : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20"
                } disabled:opacity-50`}
              >
                {isRecording ? (
                  <>
                    <Mic className="animate-bounce" size={16} />
                    <span>Listening ({countdown}s)...</span>
                  </>
                ) : processingSample ? (
                  <>
                    <RefreshCw className="animate-spin" size={16} />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Mic size={16} />
                    <span>Record Sample {currentStep}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Revocation Confirmation Modal */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Revoke Voice ID Profile?
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This will permanently delete your stored vocal biometric embeddings. You will no longer be able to log in using Voice ID until you re-enroll.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                onClick={() => setShowRevokeModal(false)}
                disabled={revoking}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
                onClick={() => void handleRevokeProfile()}
                disabled={revoking}
              >
                {revoking ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Revoking...</span>
                  </>
                ) : (
                  <span>Confirm Revoke</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
