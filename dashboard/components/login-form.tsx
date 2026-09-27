"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Info,
  QrCode,
  RotateCcw,
  CheckCircle2,
  Download,
  Laptop,
  Smartphone,
  Check,
  ScanFace,
  KeyRound,
  ExternalLink,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
} from "lucide-react";
import QRCode from "qrcode";
import { authApi } from "@/lib/api-client";
import { useRouter, useSearchParams } from "next/navigation";
import { safeReturnPath } from "@/lib/session-navigation";

import "./sign-in.css";
import { useOrgBranding } from "@/components/ui/org-branding-provider";

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm(props: LoginFormProps) {
  return <LoginFormInner {...props} />;
}

/**
 * Downloads a Windows Desktop Internet Shortcut (.url) so users can install /
 * launch KryptonVision directly from their desktop in 1 click.
 */
function downloadDesktopShortcut(appName = "KryptonVision", targetUrl?: string) {
  if (typeof window === "undefined") return;
  const currentOrigin = window.location.origin;
  const url = targetUrl || `${currentOrigin}/login?source=desktop-shortcut`;
  const iconUrl = `${currentOrigin}/favicon.ico`;
  const fileContent = `[InternetShortcut]\r\nURL=${url}\r\nIconIndex=0\r\nIconFile=${iconUrl}\r\nHotKey=0\r\nIDList=\r\n[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,0\r\n[ViewState]\r\nMode=\r\nVid=\r\nFolderType=Generic\r\n`;
  const blob = new Blob([fileContent], { type: "application/internet-shortcut;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = `${appName}.url`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Encodes Float32Array PCM samples (at sampleRate) to a 16-bit mono WAV ArrayBuffer
 */
function encodeWav16Bit(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier 'RIFF'
  writeWavString(view, 0, "RIFF");
  // file length minus RIFF identifier and length = 36 + data size
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type 'WAVE'
  writeWavString(view, 8, "WAVE");
  // format chunk identifier 'fmt '
  writeWavString(view, 12, "fmt ");
  // format chunk length 16
  view.setUint32(16, 16, true);
  // sample format (raw 1 = PCM)
  view.setUint16(20, 1, true);
  // channel count (1 = mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align) = sampleRate * 2
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample) = 2
  view.setUint16(32, 2, true);
  // bits per sample = 16
  view.setUint16(34, 16, true);
  // data chunk identifier 'data'
  writeWavString(view, 36, "data");
  // data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function writeWavString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
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

/**
 * Converts ArrayBuffer to Base64 string safely
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return window.btoa(binary);
}

function LoginFormInner({ onSuccess }: LoginFormProps) {
  const { branding } = useOrgBranding();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Authentication mode: face recognition, credentials, or voice biometrics
  const [authMode, setAuthMode] = useState<"face" | "credentials" | "voice">("credentials");

  // Voice Biometric state
  const [voiceScanState, setVoiceScanState] = useState<
    "idle" | "listening" | "processing" | "matched" | "not_found" | "mic_error"
  >("idle");
  const [voiceAudioLevel, setVoiceAudioLevel] = useState(0);
  const [voiceCountdown, setVoiceCountdown] = useState(4);
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null);
  const [voiceMatchedUser, setVoiceMatchedUser] = useState<any>(null);
  const [voiceUsername, setVoiceUsername] = useState("");

  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceAudioChunksRef = useRef<Blob[]>([]);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceAnimFrameRef = useRef<number | null>(null);
  const voiceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const voiceCountdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Zero-touch Face Recognition state
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const [faceStream, setFaceStream] = useState<MediaStream | null>(null);
  const [faceCameraActive, setFaceCameraActive] = useState(false);
  const [faceCameraReady, setFaceCameraReady] = useState(false);
  const [faceCameraError, setFaceCameraError] = useState<string | null>(null);
  const [faceScanState, setFaceScanState] = useState<
    "idle" | "starting" | "scanning" | "matched" | "not_found" | "camera_error"
  >("idle");
  const [scanAttempts, setScanAttempts] = useState(0);
  const [matchedUser, setMatchedUser] = useState<any>(null);
  const [faceErrorMessage, setFaceErrorMessage] = useState<string | null>(null);
  const [facePromptMessage, setFacePromptMessage] = useState<string | null>(null);

  const scanLockRef = useRef(false);
  const attemptsRef = useRef(0);
  const autoScanActiveRef = useRef(false);
  const autoScanTimerRef = useRef<NodeJS.Timeout | null>(null);

  // QR Code state
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showQR, setShowQR] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Application Installation state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [activeInstallTab, setActiveInstallTab] = useState<"desktop" | "ios" | "android">("desktop");
  const [isInIframe, setIsInIframe] = useState(false);

  // Traditional credentials state
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    tenantSlug: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Detect iframe environment
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsInIframe(window.self !== window.top);
    }
  }, []);

  // Cleanup active camera and microphone streams on unmount
  useEffect(() => {
    return () => {
      stopFaceCamera();
      stopVoiceRecording();
    };
  }, []);

  // Check for session expiry or error query parameters
  useEffect(() => {
    if (!searchParams) return;

    const reason = searchParams.get("reason") || searchParams.get("expired");

    if (reason === "expired" || reason === "true") {
      setInfo("Your session has expired. Please sign in again.");
    } else if (reason === "invalid") {
      setInfo("Please sign in to continue.");
    } else if (reason === "network") {
      setError("Cannot connect to server. Please check your connection and try again.");
    } else if (searchParams.get("logout") === "true") {
      setInfo("You have been signed out successfully.");
    }
  }, [searchParams]);

  // Generate QR code for mobile login
  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentUrl = window.location.origin + window.location.pathname;
      setLoginUrl(currentUrl);
    }
  }, []);

  useEffect(() => {
    if (!loginUrl) return;

    QRCode.toDataURL(loginUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: "#1e293b",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error("Failed to generate QR data URL:", err);
      });
  }, [loginUrl]);

  // Detect PWA installation and standalone mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkStandalone = () => {
        const isStandaloneMode =
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as any).standalone === true ||
          document.referrer.includes("android-app://");
        setIsStandalone(isStandaloneMode);
        if (isStandaloneMode) setIsInstalled(true);
      };

      checkStandalone();

      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      const handleAppInstalled = () => {
        setIsInstalled(true);
        setDeferredPrompt(null);
        setShowInstallModal(false);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.addEventListener("appinstalled", handleAppInstalled);

      const ua = navigator.userAgent || "";
      if (/iPhone|iPad|iPod/i.test(ua)) {
        setActiveInstallTab("ios");
      } else if (/Android/i.test(ua)) {
        setActiveInstallTab("android");
      } else {
        setActiveInstallTab("desktop");
      }

      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.removeEventListener("appinstalled", handleAppInstalled);
      };
    }
  }, []);

  /**
   * Install App button handler:
   * 1. If native PWA install prompt is ready, trigger it.
   * 2. Otherwise open the comprehensive installer modal with 1-click Windows desktop shortcut.
   */
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === "accepted") {
          setIsInstalled(true);
          setDeferredPrompt(null);
          setShowInstallModal(false);
          return;
        }
      } catch (err) {
        console.warn("PWA prompt error:", err);
      }
    }
    setShowInstallModal(true);
  };

  /**
   * Stop camera tracks cleanly
   */
  const stopFaceCamera = useCallback(() => {
    autoScanActiveRef.current = false;
    if (autoScanTimerRef.current) {
      clearInterval(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((track) => track.stop());
      faceStreamRef.current = null;
    }
    setFaceStream(null);
    setFaceCameraActive(false);
    setFaceCameraReady(false);
  }, []);

  /**
   * Request webcam access and initialize live video stream
   */
  const startFaceCamera = useCallback(async () => {
    stopFaceCamera();
    setFaceCameraError(null);
    setFaceCameraReady(false);
    setFaceErrorMessage(null);
    setFacePromptMessage(null);
    setFaceScanState("starting");
    attemptsRef.current = 0;
    setScanAttempts(0);
    autoScanActiveRef.current = true;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is not supported or blocked by browser security (requires HTTPS). Please sign in with username and password."
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      faceStreamRef.current = stream;
      setFaceStream(stream);
      setFaceCameraActive(true);
    } catch (err: any) {
      console.warn("Face camera start failed:", err);
      autoScanActiveRef.current = false;
      const isDenied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      const isEmbedded = typeof window !== "undefined" && window.self !== window.top;
      const msg = isDenied
        ? isEmbedded
          ? "Camera permission is blocked by the host page. The kryptonlogic.com iframe must include allow=\"camera\" (and must not block it with sandbox), then allow the browser prompt."
          : "Camera access permission was denied. Please allow camera access in browser settings or sign in with username and password."
        : err.message || "Unable to access the camera. Check camera permissions and try again.";
      setFaceCameraError(msg);
      setFaceScanState("camera_error");
      stopFaceCamera();
    }
  }, [stopFaceCamera]);

  // Manage camera lifecycle based on authMode
  useEffect(() => {
    if (authMode === "face" && faceScanState !== "matched" && faceScanState !== "not_found") {
      startFaceCamera();
    } else {
      stopFaceCamera();
    }
    return () => {
      stopFaceCamera();
    };
  }, [authMode, startFaceCamera, stopFaceCamera]);

  // Bind video element to camera stream
  useEffect(() => {
    const video = faceVideoRef.current;
    if (!faceCameraActive || !faceStreamRef.current || !video) {
      setFaceCameraReady(false);
      return;
    }

    video.srcObject = faceStreamRef.current;

    let isSubscribed = true;
    const handleCanPlay = () => {
      if (isSubscribed) {
        setFaceCameraReady(true);
        setFaceScanState("scanning");
      }
    };

    video.addEventListener("canplay", handleCanPlay);
    video.play().catch((err) => {
      console.warn("Face video play interrupted:", err);
      if (isSubscribed) {
        setFaceCameraError("Unable to start video preview. Check camera permissions.");
        setFaceScanState("camera_error");
      }
    });

    return () => {
      isSubscribed = false;
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [faceCameraActive, faceScanState]);

  /**
   * Automated Zero-Touch Face Recognition Scanning Loop:
   * Captures frames every 1.2s and runs 1-to-N biometric matching against enrolled faces.
   * If recognized: logs in automatically and redirects.
   * If not recognized after 5 attempts: stops camera and reverts with "Face not found".
   */
  useEffect(() => {
    if (
      authMode !== "face" ||
      !faceCameraActive ||
      !faceCameraReady ||
      faceScanState !== "scanning"
    ) {
      if (autoScanTimerRef.current) {
        clearInterval(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
      return;
    }

    const interval = setInterval(async () => {
      if (!autoScanActiveRef.current) return;
      if (scanLockRef.current) return;
      if (attemptsRef.current >= 5) return;

      const video = faceVideoRef.current;
      const canvas = faceCanvasRef.current;
      if (!video || !canvas || video.videoWidth === 0 || video.readyState < 2) {
        return;
      }

      scanLockRef.current = true;

      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const cropSize = Math.min(vw, vh);
        const startX = (vw - cropSize) / 2;
        const startY = (vh - cropSize) / 2;
        const targetSize = Math.min(cropSize, 480);

        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          scanLockRef.current = false;
          return;
        }

        ctx.drawImage(video, startX, startY, cropSize, cropSize, 0, 0, targetSize, targetSize);

        // Pre-flight face presence verification:
        // 1. Hardware/browser accelerated Shape Detection API (Chromium / Edge)
        if (typeof window !== "undefined" && "FaceDetector" in window) {
          try {
            const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
            const detectedFaces = await detector.detect(canvas);
            if (!detectedFaces || detectedFaces.length === 0) {
              setFacePromptMessage("Looking for face... Please look directly at the camera.");
              scanLockRef.current = false;
              return;
            }
          } catch {
            // Fall back to canvas pixel inspection if FaceDetector throws
          }
        }

        // 2. Optical luminance & contrast inspection across the central face zone
        const sampleArea = Math.floor(targetSize * 0.5);
        const sampleStart = Math.floor(targetSize * 0.25);
        const imgData = ctx.getImageData(sampleStart, sampleStart, sampleArea, sampleArea);
        const pixels = imgData.data;
        let sumLum = 0;
        const totalSamples = pixels.length / 4;
        for (let i = 0; i < pixels.length; i += 4) {
          sumLum += pixels[i]! * 0.299 + pixels[i + 1]! * 0.587 + pixels[i + 2]! * 0.114;
        }
        const avgLum = sumLum / totalSamples;
        let varianceSum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const l = pixels[i]! * 0.299 + pixels[i + 1]! * 0.587 + pixels[i + 2]! * 0.114;
          varianceSum += (l - avgLum) ** 2;
        }
        const lumVariance = varianceSum / totalSamples;

        // If the frame is pitch black, washed out, or completely uniform/blank (e.g. wall, ceiling, covered lens):
        if (avgLum < 20 || avgLum > 235 || lumVariance < 35) {
          setFacePromptMessage("Looking for face... Please look directly at the camera.");
          scanLockRef.current = false;
          return;
        }

        setFacePromptMessage(null);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.90);

        const response = await authApi.faceLogin(
          dataUrl,
          formData.tenantSlug.trim() || undefined
        );

        // Biometric Face Match Verified!
        autoScanActiveRef.current = false;
        if (autoScanTimerRef.current) {
          clearInterval(autoScanTimerRef.current);
          autoScanTimerRef.current = null;
        }
        stopFaceCamera();
        setMatchedUser(response.user);
        setFaceScanState("matched");

        // Complete login and navigate
        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            const destination = safeReturnPath(searchParams?.get("next"));
            if (destination !== "/") {
              window.location.href = destination;
            } else {
              const userObj = response.user;
              const allowedMenus = Array.isArray(userObj?.menuAccess) ? userObj.menuAccess : [];
              if (allowedMenus.length > 0 && !allowedMenus.includes("/")) {
                window.location.href = allowedMenus[0];
              } else {
                window.location.href = "/";
              }
            }
          }
        }, 850);
      } catch (err: any) {
        // Do not classify transport, enrollment, or server errors as a face
        // mismatch. Previously three transient failures were displayed as
        // "Face not found", which hid the actual deployment problem.
        const apiCode = err?.details?.error ?? err?.details?.code;
        const isMismatch = err?.statusCode === 401 && apiCode === "face_not_recognized";
        if (!isMismatch) {
          autoScanActiveRef.current = false;
          if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
          setFaceScanState("not_found");
          setFaceErrorMessage(err instanceof Error ? err.message : "Face sign-in service is unavailable. Please try again.");
          return;
        }
        attemptsRef.current += 1;
        const currentCount = attemptsRef.current;
        setScanAttempts(currentCount);

        if (currentCount >= 5) {
          // Revert after 3 failed tries
          autoScanActiveRef.current = false;
          if (autoScanTimerRef.current) {
            clearInterval(autoScanTimerRef.current);
            autoScanTimerRef.current = null;
          }
          stopFaceCamera();
          setFaceScanState("not_found");
          setFaceErrorMessage(
            "Face not found. We could not recognize your face after 5 attempts. Please improve lighting, center your face, and try again."
          );
        }
      } finally {
        scanLockRef.current = false;
      }
    }, 1250);

    autoScanTimerRef.current = interval;

    return () => {
      clearInterval(interval);
      autoScanTimerRef.current = null;
    };
  }, [
    authMode,
    faceCameraActive,
    faceCameraReady,
    faceScanState,
    formData.tenantSlug,
    onSuccess,
    searchParams,
    stopFaceCamera,
  ]);

  /**
   * Retry Face Recognition from "not_found" or error state
   */
  const handleRetryFaceRecognition = () => {
    attemptsRef.current = 0;
    setScanAttempts(0);
    setFaceErrorMessage(null);
    setFacePromptMessage(null);
    setFaceScanState("idle");
    startFaceCamera();
  };

  /**
   * Stop voice recording and cleanup audio resources
   */
  const stopVoiceRecording = useCallback(() => {
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (voiceCountdownTimerRef.current) {
      clearInterval(voiceCountdownTimerRef.current);
      voiceCountdownTimerRef.current = null;
    }
    if (voiceAnimFrameRef.current) {
      cancelAnimationFrame(voiceAnimFrameRef.current);
      voiceAnimFrameRef.current = null;
    }
    if (voiceMediaRecorderRef.current && voiceMediaRecorderRef.current.state !== "inactive") {
      try {
        voiceMediaRecorderRef.current.stop();
      } catch {}
      voiceMediaRecorderRef.current = null;
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
    if (voiceAudioContextRef.current && voiceAudioContextRef.current.state !== "closed") {
      voiceAudioContextRef.current.close().catch(() => {});
      voiceAudioContextRef.current = null;
    }
    setVoiceAudioLevel(0);
  }, []);

  /**
   * Process recorded voice audio and verify biometric signature
   */
  const processVoiceAudio = useCallback(async (audioBlob: Blob) => {
    setVoiceScanState("processing");
    stopVoiceRecording();

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
          console.warn("Web Audio decode error, falling back to blob base64:", decodeErr);
          base64Audio = arrayBufferToBase64(arrayBuffer);
          audioFormat = "webm";
        }
      } else {
        base64Audio = arrayBufferToBase64(arrayBuffer);
        audioFormat = "webm";
      }

      const response = await authApi.voiceLogin({
        audioData: base64Audio,
        audioFormat,
        authMethod: voiceUsername.trim() ? "speaker_verification" : "speaker_identification",
        username: voiceUsername.trim() || undefined,
        tenantSlug: formData.tenantSlug.trim() || undefined,
      });

      // Biometric Voice Match Verified!
      setVoiceMatchedUser(response.user);
      setVoiceScanState("matched");

      // Complete login and navigate
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          const destination = safeReturnPath(searchParams?.get("next"));
          if (destination !== "/") {
            window.location.href = destination;
          } else {
            const userObj = response.user;
            const allowedMenus = Array.isArray(userObj?.menuAccess) ? userObj.menuAccess : [];
            if (allowedMenus.length > 0 && !allowedMenus.includes("/")) {
              window.location.href = allowedMenus[0];
            } else {
              window.location.href = "/";
            }
          }
        }
      }, 850);
    } catch (err: any) {
      console.warn("Voice login failed:", err);
      setVoiceScanState("not_found");
      const apiCode = err?.details?.error ?? err?.details?.code;
      const customMsg =
        apiCode === "quality_failed"
          ? "Audio was too quiet or unclear. Please speak more loudly and closer to the microphone."
          : apiCode === "poor_audio_quality"
          ? "Audio quality was insufficient. Please reduce background noise and speak clearly."
          : err?.message || "Voice biometric authentication failed. Please try again or sign in with your password.";
      setVoiceErrorMessage(customMsg);
    }
  }, [formData.tenantSlug, onSuccess, searchParams, stopVoiceRecording, voiceUsername]);

  /**
   * Request microphone access and begin live voice recording
   */
  const startVoiceRecording = useCallback(async () => {
    stopVoiceRecording();
    stopFaceCamera();
    setVoiceErrorMessage(null);
    setVoiceScanState("listening");
    setVoiceCountdown(4);
    voiceAudioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access is not supported by your browser or requires HTTPS. Please sign in with your password."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      voiceStreamRef.current = stream;

      // Initialize AudioContext & AnalyserNode for reactive visualizer
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          const audioCtx = new AudioCtx();
          voiceAudioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          voiceAnalyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateAudioLevel = () => {
            if (!voiceAnalyserRef.current) return;
            voiceAnalyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i]!;
            }
            const avg = sum / (dataArray.length * 255);
            setVoiceAudioLevel(avg);
            voiceAnimFrameRef.current = requestAnimationFrame(updateAudioLevel);
          };
          voiceAnimFrameRef.current = requestAnimationFrame(updateAudioLevel);
        } catch (e) {
          console.warn("AudioContext visualizer init skipped:", e);
        }
      }

      // Initialize MediaRecorder
      let mimeType = "";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      voiceMediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          voiceAudioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(voiceAudioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        processVoiceAudio(audioBlob);
      };

      recorder.start(250);

      // 4-second countdown
      let remaining = 4;
      voiceCountdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        setVoiceCountdown(remaining);
        if (remaining <= 0) {
          if (voiceCountdownTimerRef.current) {
            clearInterval(voiceCountdownTimerRef.current);
            voiceCountdownTimerRef.current = null;
          }
        }
      }, 1000);

      // Auto-stop after 4 seconds
      voiceTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 4000);
    } catch (err: any) {
      console.warn("Microphone start failed:", err);
      const isDenied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      const msg = isDenied
        ? "Microphone access was denied. Please allow microphone permissions in your browser or sign in with your password."
        : err.message || "Unable to access microphone. Please check permissions.";
      setVoiceErrorMessage(msg);
      setVoiceScanState("mic_error");
      stopVoiceRecording();
    }
  }, [processVoiceAudio, stopFaceCamera, stopVoiceRecording]);

  const handleStopAndVerify = () => {
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (voiceCountdownTimerRef.current) {
      clearInterval(voiceCountdownTimerRef.current);
      voiceCountdownTimerRef.current = null;
    }
    if (voiceMediaRecorderRef.current && voiceMediaRecorderRef.current.state === "recording") {
      voiceMediaRecorderRef.current.stop();
    }
  };

  /**
   * Switch to voice authentication mode
   */
  const handleSwitchToVoice = () => {
    stopFaceCamera();
    stopVoiceRecording();
    setAuthMode("voice");
    setError(null);
    setVoiceErrorMessage(null);
    setVoiceScanState("idle");
  };

  /**
   * Switch to traditional password mode
   */
  const handleSwitchToCredentials = () => {
    stopFaceCamera();
    stopVoiceRecording();
    setAuthMode("credentials");
    setFaceErrorMessage(null);
    setFacePromptMessage(null);
    setVoiceErrorMessage(null);
    setError(null);
  };

  /**
   * Traditional Username & Password submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await authApi.login(
        formData.username.trim(),
        formData.password,
        formData.tenantSlug.trim() || undefined
      );

      if ((response as any)?.user?.mustChangePassword) {
        setMustChangePassword(true);
        setInfo("You must change your password before continuing.");
        setLoading(false);
        return;
      }

      if (onSuccess) {
        onSuccess();
      } else {
        const destination = safeReturnPath(searchParams?.get("next"));
        if (destination !== "/") {
          window.location.href = destination;
        } else {
          const userObj = (response as any)?.user;
          const allowedMenus = Array.isArray(userObj?.menuAccess) ? userObj.menuAccess : [];
          if (allowedMenus.length > 0 && !allowedMenus.includes("/")) {
            window.location.href = allowedMenus[0];
          } else {
            window.location.href = "/";
          }
        }
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      const serverErr = err.response?.data?.error || err.details?.error;
      if (serverErr === "facial_verification_required") {
        setAuthMode("face");
        setInfo("Facial biometric verification required. Please face the camera.");
        return;
      }
      const rawMsg =
        err.response?.data?.message ||
        err.details?.message ||
        err.message ||
        "Invalid username or password";
      setError(
        typeof rawMsg === "string" ? rawMsg : (typeof rawMsg === "object" ? JSON.stringify(rawMsg) : String(rawMsg))
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      await authApi.changePassword(user.id || "me", formData.password, newPassword);

      await authApi.login(
        formData.username.trim(),
        newPassword,
        formData.tenantSlug.trim() || undefined
      );

      setMustChangePassword(false);
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(safeReturnPath(searchParams?.get("next")));
      }
    } catch (err: any) {
      console.error("Password change failed:", err);
      const rawMsg =
        err.response?.data?.message ||
        err.details?.message ||
        err.message ||
        "Failed to change password";
      setError(
        typeof rawMsg === "string" ? rawMsg : (typeof rawMsg === "object" ? JSON.stringify(rawMsg) : String(rawMsg))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (mustChangePassword) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-brand">
              <ShieldCheck size={32} className="brand-icon" />
              <h1>Change Password</h1>
            </div>
            <p className="login-subtitle">Please set a new password for your account</p>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <AlertCircle size={16} />
              <span>{typeof error === "string" ? error : JSON.stringify(error)}</span>
            </div>
          )}

          {info && (
            <div className="login-info" role="status">
              <Info size={16} />
              <span>{typeof info === "string" ? info : JSON.stringify(info)}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="login-form">
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                name="newPassword"
                className="login-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Enter new password"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                className="login-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
                disabled={loading}
              />
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "Updating..." : "Update Password & Continue"}
            </button>
          </form>
        </div>

        <footer className="login-footer">
          <p>&copy; 2026 OM Systems. All rights reserved.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="login-container login-workspace auth-entry">
      <div className="auth-entry-layout">
      <aside className="login-introduction" aria-label="About your workspace">
        <div className="login-introduction-brand">{branding.logoUrl ? <img src={branding.logoUrl} alt="" /> : <span className="auth-brand-mark"><ShieldCheck size={24} /></span>}<span>{branding.orgName || "KryptonVision"}</span></div>
        <div className="login-introduction-copy">
          <p className="login-kicker">BUILT FOR WHAT HAPPENS NEXT</p>
          <h2>Security doesn&apos;t begin<br />at the alarm.<br /><em>It begins before it.</em></h2>
          <p>Turn every camera, site, and signal into operational foresight—so your team can act while it still matters.</p>
          <ul>
            <li><CheckCircle2 size={18} /><span>Every camera and site in one live operational view</span></li>
            <li><CheckCircle2 size={18} /><span>AI that surfaces what matters before risk escalates</span></li>
            <li><CheckCircle2 size={18} /><span>Faster response with resilient, auditable control</span></li>
          </ul>
        </div>
        <div className="auth-command-visual" aria-hidden="true">
          <div className="auth-visual-grid" />
          <div className="auth-orbit auth-orbit-one" />
          <div className="auth-orbit auth-orbit-two" />
          <div className="auth-signal auth-signal-one" />
          <div className="auth-signal auth-signal-two" />
          <div className="auth-core"><ShieldCheck size={27} /></div>
          <div className="auth-visual-caption"><span className="auth-visual-pulse" /> LIVE SECURITY POSTURE</div>
        </div>
        <p className="login-introduction-footer"><ShieldCheck size={15} /> Intelligence, clarity, and control—always within reach.</p>
      </aside>
      <div className="login-card">
        <header className="login-header">
          <p className="auth-entry-eyebrow">YOUR WORKSPACE</p>
          <h1>Sign in</h1>
          <p>Welcome back. Enter your account details to continue.</p>
        </header>

        {/* Authentication Mode Switcher */}
        <div className="auth-mode-selector" role="group" aria-label="Sign-in method">
          <button
            type="button"
            onClick={handleSwitchToCredentials}
            className={`auth-mode-btn ${authMode === "credentials" ? "active" : ""}`}
            aria-pressed={authMode === "credentials"}
            title="Sign in with Username and Password"
          >
            <KeyRound size={16} />
            <span>Password</span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopVoiceRecording();
              setAuthMode("face");
              setError(null);
              setFaceErrorMessage(null);
              setScanAttempts(0);
              setFaceScanState("idle");
            }}
            className={`auth-mode-btn ${authMode === "face" ? "active" : ""}`}
            aria-pressed={authMode === "face"}
            title="Zero-Touch Facial Recognition (For enrolled users)"
          >
            <ScanFace size={16} />
            <span>Face ID</span>
          </button>
          <button
            type="button"
            onClick={handleSwitchToVoice}
            className={`auth-mode-btn ${authMode === "voice" ? "active" : ""}`}
            aria-pressed={authMode === "voice"}
            title="Voice Biometric Authentication (For enrolled users)"
          >
            <Mic size={16} />
            <span>Voice ID</span>
          </button>
        </div>

        {error && (
          <div className="login-error" role="alert">
            <AlertCircle size={16} />
            <span>{typeof error === "string" ? error : JSON.stringify(error)}</span>
          </div>
        )}

        {info && (
          <div className="login-info" role="status">
            <Info size={16} />
            <span>{typeof info === "string" ? info : JSON.stringify(info)}</span>
          </div>
        )}

        {/* MODE 1: ZERO-TOUCH BIOMETRIC FACE RECOGNITION */}
        {authMode === "face" && (
          <div className="zero-touch-face-section">
            {faceScanState === "matched" ? (
              <div className="face-success-panel">
                <div className="face-success-icon-wrap">
                  <CheckCircle2 size={44} className="text-emerald-500" />
                </div>
                <h3>Face Recognized!</h3>
                <p className="face-user-name">
                  Welcome back, <strong>{matchedUser?.displayName || matchedUser?.username}</strong>
                </p>
                <div className="face-logging-in-badge">
                  <span className="pulse-dot-green" />
                  <span>Access Granted &bull; Launching Operations...</span>
                </div>
              </div>
            ) : faceScanState === "not_found" ? (
              <div className="face-not-found-panel">
                <div className="face-not-found-icon-wrap">
                  <AlertCircle size={36} className="text-amber-500" />
                </div>
                <h3>Face Not Found</h3>
                <p className="face-not-found-msg">
                  {faceErrorMessage ||
                    "Face not found. We could not recognize your face after 3 attempts. Please try again or sign in with your username and password."}
                </p>
                <div className="face-fallback-actions">
                  <button
                    type="button"
                    onClick={handleRetryFaceRecognition}
                    className="btn-retry-face"
                  >
                    <RotateCcw size={14} /> Try Face Recognition Again
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToCredentials}
                    className="btn-switch-credentials"
                  >
                    <KeyRound size={14} /> Sign In with Password
                  </button>
                </div>
              </div>
            ) : faceScanState === "camera_error" ? (
              <div className="face-camera-error-panel">
                <AlertCircle size={32} className="text-red-500" />
                <h3>Camera Unavailable</h3>
                <p>
                  {faceCameraError ||
                    "Camera access was denied or is unavailable. Please allow camera permissions in your browser or sign in with your username and password."}
                </p>
                <div className="face-fallback-actions">
                  <button
                    type="button"
                    onClick={() => startFaceCamera()}
                    className="btn-retry-face"
                  >
                    <RotateCcw size={14} /> Retry Camera
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToCredentials}
                    className="btn-switch-credentials"
                  >
                    <KeyRound size={14} /> Sign In with Password
                  </button>
                </div>
              </div>
            ) : (
              <div className="face-scanner-view">
                <div className="face-viewfinder-container">
                  <video
                    ref={faceVideoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Facial biometric scan camera preview"
                  />
                  <div className="face-biometric-overlay">
                    <div className="biometric-corner top-left" />
                    <div className="biometric-corner top-right" />
                    <div className="biometric-corner bottom-left" />
                    <div className="biometric-corner bottom-right" />
                    <div className="face-oval-guide">
                      <div className="biometric-laser-line" />
                    </div>
                    <div className="biometric-scan-status">
                      <span className="pulse-dot" />
                      <span>
                        {faceCameraReady
                          ? `Scanning automatically... (Attempt ${Math.min(
                              scanAttempts + 1,
                              5
                            )} of 5)`
                          : "Initializing biometric camera..."}
                      </span>
                    </div>
                  </div>
                </div>

                <canvas ref={faceCanvasRef} style={{ display: "none" }} />

                <div className="face-scan-guidance">
                  <p>
                    {facePromptMessage
                      ? facePromptMessage
                      : faceCameraReady
                      ? "Stand directly in front of the camera. Verification happens automatically without clicking."
                      : "Connecting to secure biometric sensor..."}
                  </p>
                  <div className="attempt-progress-dots">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <span
                        key={num}
                        className={`dot-step ${
                          scanAttempts >= num
                            ? "tried"
                            : scanAttempts + 1 === num
                            ? "active"
                            : "pending"
                        }`}
                        title={`Attempt ${num} of 5`}
                      />
                    ))}
                  </div>
                </div>

                <div className="face-quick-switch-link">
                  <button type="button" onClick={handleSwitchToCredentials}>
                    Sign in with username &amp; password instead &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODE 3: VOICE BIOMETRIC AUTHENTICATION */}
        {authMode === "voice" && (
          <div className="voice-auth-section">
            {voiceScanState === "matched" ? (
              <div className="voice-success-panel">
                <div className="voice-success-icon-wrap">
                  <CheckCircle2 size={44} className="text-emerald-500" />
                </div>
                <h3>Voice Authenticated!</h3>
                <p className="voice-user-name">
                  Welcome back, <strong>{voiceMatchedUser?.displayName || voiceMatchedUser?.username}</strong>
                </p>
                <div className="voice-logging-in-badge">
                  <span className="pulse-dot-green" />
                  <span>Access Granted &bull; Launching Operations...</span>
                </div>
              </div>
            ) : voiceScanState === "not_found" ? (
              <div className="voice-error-panel">
                <div className="voice-error-icon-wrap">
                  <AlertCircle size={36} className="text-amber-500" />
                </div>
                <h3>Voice Not Recognized</h3>
                <p className="voice-error-msg">
                  {voiceErrorMessage ||
                    "We could not verify your voice profile. Please ensure minimal background noise, speak clearly, and try again."}
                </p>
                <div className="voice-fallback-actions">
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="btn-retry-voice"
                  >
                    <RotateCcw size={14} /> Try Voice ID Again
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToCredentials}
                    className="btn-switch-credentials"
                  >
                    <KeyRound size={14} /> Sign In with Password
                  </button>
                </div>
              </div>
            ) : voiceScanState === "mic_error" ? (
              <div className="voice-error-panel">
                <AlertCircle size={32} className="text-red-500" />
                <h3>Microphone Unavailable</h3>
                <p>
                  {voiceErrorMessage ||
                    "Microphone access was denied or is unavailable. Please grant microphone permissions in your browser or sign in with your password."}
                </p>
                <div className="voice-fallback-actions">
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="btn-retry-voice"
                  >
                    <RotateCcw size={14} /> Retry Microphone
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToCredentials}
                    className="btn-switch-credentials"
                  >
                    <KeyRound size={14} /> Sign In with Password
                  </button>
                </div>
              </div>
            ) : (
              <div className="voice-scanner-view">
                <div className={`voice-mic-container ${voiceScanState === "listening" ? "is-listening" : ""}`}>
                  <div
                    className="voice-pulse-ring"
                    style={{
                      transform: `scale(${1 + voiceAudioLevel * 0.5})`,
                      opacity: voiceScanState === "listening" ? 0.3 + voiceAudioLevel * 0.7 : 0.2,
                    }}
                  />
                  <div
                    className="voice-pulse-ring second"
                    style={{
                      transform: `scale(${1 + voiceAudioLevel * 0.9})`,
                      opacity: voiceScanState === "listening" ? 0.2 + voiceAudioLevel * 0.5 : 0,
                    }}
                  />
                  <div className="voice-mic-button-wrapper">
                    <button
                      type="button"
                      onClick={voiceScanState === "listening" ? handleStopAndVerify : startVoiceRecording}
                      disabled={voiceScanState === "processing"}
                      className={`voice-mic-action-btn ${voiceScanState === "listening" ? "recording" : ""}`}
                      aria-label={voiceScanState === "listening" ? "Stop recording and verify" : "Start voice authentication"}
                    >
                      {voiceScanState === "processing" ? (
                        <div className="voice-spinner" />
                      ) : voiceScanState === "listening" ? (
                        <Mic size={38} className="animate-pulse text-red-500" />
                      ) : (
                        <Mic size={38} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Animated Waveform Bars */}
                {voiceScanState === "listening" && (
                  <div className="voice-waveform-bars">
                    {[0.6, 1.2, 0.8, 1.5, 0.9, 1.3, 0.7, 1.4, 1.0, 0.5].map((factor, idx) => (
                      <span
                        key={idx}
                        className="waveform-bar"
                        style={{
                          height: `${Math.max(6, Math.min(42, 8 + voiceAudioLevel * 60 * factor))}px`,
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="voice-scan-guidance">
                  <h4>
                    {voiceScanState === "processing"
                      ? "Analyzing Voice Biometrics..."
                      : voiceScanState === "listening"
                      ? `Listening... Speak now (${voiceCountdown}s remaining)`
                      : "Voice Biometric Authentication"}
                  </h4>
                  <p>
                    {voiceScanState === "processing"
                      ? "Verifying speaker acoustic features with biometric security..."
                      : voiceScanState === "listening"
                      ? "Say your passphrase or speak normally into your microphone."
                      : "Click the microphone button and speak for 2-3 seconds to verify your identity."}
                  </p>

                  {voiceScanState === "listening" && (
                    <button
                      type="button"
                      onClick={handleStopAndVerify}
                      className="btn-stop-verify"
                    >
                      Verify Voice Now &rarr;
                    </button>
                  )}
                </div>

                {/* Optional Username Filter (1-to-1 Verification) */}
                {voiceScanState === "idle" && (
                  <div className="voice-optional-user">
                    <label htmlFor="voiceUsername" className="voice-user-label">
                      Username <span className="optional-tag">(Optional)</span>
                    </label>
                    <input
                      id="voiceUsername"
                      type="text"
                      value={voiceUsername}
                      onChange={(e) => setVoiceUsername(e.target.value)}
                      placeholder="e.g. admin or employee ID"
                      className="voice-username-input"
                    />
                    <span className="voice-user-hint">
                      Leave blank for zero-touch automatic speaker identification.
                    </span>
                  </div>
                )}

                <div className="voice-quick-switch-link">
                  <button type="button" onClick={handleSwitchToCredentials}>
                    Sign in with username &amp; password instead &rarr;
                  </button>
                </div>
                <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                  Haven&apos;t enrolled your Voice ID yet? Sign in with your credentials and enroll under <strong>Account &amp; Security Settings</strong>.
                </p>
              </div>
            )}
          </div>
        )}

        {/* MODE 2: TRADITIONAL USERNAME & PASSWORD */}
        {authMode === "credentials" && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                className="login-input"
                value={formData.username}
                onChange={handleChange}
                required
                autoComplete="username"
                placeholder="Enter your username"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  className="login-input"
                    value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="auth-label-row">
                <a href="/forgot-password" className="forgot-password-link">Forgot password?</a>
              </div>
            </div>

            <details className="login-organization">
              <summary>Use an organization code</summary>
              <div className="form-group">
              <label htmlFor="tenantSlug">
                Organization Code <span className="optional-label">(optional)</span>
              </label>
              <input
                type="text"
                id="tenantSlug"
                name="tenantSlug"
                className="login-input"
                value={formData.tenantSlug}
                onChange={handleChange}
                placeholder="Provided by your administrator"
                disabled={loading}
              />
              </div>
            </details>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>

          </form>
        )}

        <div className="login-help">
          <p>
            Need help?{" "}
            <a href="/support" className="support-link">
              Contact Support
            </a>
          </p>
        </div>

        <details className="login-other-options">
        <summary><Laptop size={15} /> Desktop and mobile access</summary>
        <div className="login-install-section">
          <div className="install-banner">
            <div className="install-banner-icon">
              <img src="/icon-192.png" alt="KryptonVision App" className="install-app-icon" />
            </div>
            <div className="install-banner-text">
              <h4>{isStandalone ? "KryptonVision App Active" : "Install KryptonVision Desktop App"}</h4>
              <p>
                {isStandalone
                  ? "You are currently running in standalone application mode."
                  : "Install on Windows Desktop, Mac, or Mobile in 1 click."}
              </p>
            </div>
            {!isStandalone && (
              <button
                type="button"
                onClick={() => {
                  if (deferredPrompt) {
                    handleInstallClick();
                  } else {
                    downloadDesktopShortcut("KryptonVision");
                  }
                }}
                className="btn-install-pwa"
                title="Download 1-click Windows Desktop Shortcut or install as standalone app"
              >
                <Download size={13} /> {deferredPrompt ? "Install Now" : "Get Desktop App"}
              </button>
            )}
          </div>
        </div>

        {/* QR Code Section */}
        <div className="login-qr-section">
          <button
            type="button"
            className="qr-toggle-btn"
            onClick={() => setShowQR(!showQR)}
          >
            <QrCode size={18} />
            {showQR ? "Hide Login QR Code" : "Show Login QR Code"}
          </button>

          {showQR && (
            <div className="qr-display">
              <p className="qr-label">Scan to access login page</p>
              <div
                className="qr-canvas-wrapper"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minHeight: "200px",
                  padding: "8px",
                }}
              >
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Login QR Code"
                    width={200}
                    height={200}
                    className="qr-image"
                    style={{ borderRadius: "8px", background: "#ffffff", padding: "4px" }}
                  />
                ) : (
                  <canvas ref={qrCanvasRef} width={200} height={200} />
                )}
              </div>
              <p className="qr-url">{loginUrl}</p>
              <small className="qr-note">
                Share this QR code to allow others to access the login page from their mobile devices
              </small>
            </div>
          )}
        </div>
        </details>
      </div>
      </div>

      <footer className="login-footer">
        <p>&copy; 2026 OM Systems. All rights reserved.</p>
        <div className="footer-links">
          <a href="/privacy">Privacy Policy</a>
          <span>&bull;</span>
          <a href="/terms">Terms of Service</a>
        </div>
      </footer>

      {/* Interactive Install Guide Modal */}
      {showInstallModal && (
        <div className="pwa-modal-overlay" onClick={() => setShowInstallModal(false)}>
          <div className="pwa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
              <div className="flex items-center gap-3">
                <img
                  src="/icon-192.png"
                  alt="KryptonVision"
                  className="w-8 h-8 rounded-lg shadow-sm"
                />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Install KryptonVision Application
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Enterprise Security Operations Center
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInstallModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold px-2 py-1 rounded-md"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Platform Selection Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/50 p-1.5 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveInstallTab("desktop")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeInstallTab === "desktop"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Laptop size={14} /> Desktop (PC/Mac)
              </button>
              <button
                type="button"
                onClick={() => setActiveInstallTab("ios")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeInstallTab === "ios"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Smartphone size={14} /> iOS (iPhone)
              </button>
              <button
                type="button"
                onClick={() => setActiveInstallTab("android")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeInstallTab === "android"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Smartphone size={14} /> Android
              </button>
            </div>

            {/* Tab Instructions Content */}
            <div className="p-5 space-y-4 text-xs">
              {activeInstallTab === "desktop" && (
                <div className="space-y-3">
                  {/* 1-Click Desktop Shortcut Downloader */}
                  <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-blue-900 dark:text-blue-200 text-xs flex items-center gap-1.5">
                          <Laptop size={14} /> 1-Click Windows Desktop Launcher
                        </p>
                        <p className="text-[11px] text-blue-700 dark:text-blue-300">
                          Place a permanent KryptonVision application icon directly on your Windows desktop.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadDesktopShortcut("KryptonVision")}
                        className="py-1.5 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1.5 flex-shrink-0"
                      >
                        <Download size={13} /> Download Shortcut (.url)
                      </button>
                    </div>
                  </div>

                  {/* Browser PWA 1-Click Prompt if ready */}
                  {deferredPrompt && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-emerald-900 dark:text-emerald-200 text-xs">
                          Native Browser App Ready
                        </p>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                          Click to install directly as a Chrome/Edge application window.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (deferredPrompt) {
                            await deferredPrompt.prompt();
                            const res = await deferredPrompt.userChoice;
                            if (res?.outcome === "accepted") {
                              setIsInstalled(true);
                              setDeferredPrompt(null);
                              setShowInstallModal(false);
                            }
                          }
                        }}
                        className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1.5 flex-shrink-0"
                      >
                        <Download size={13} /> Install PWA
                      </button>
                    </div>
                  )}

                  {/* If embedded in iframe, provide breakout */}
                  {isInIframe && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-amber-900 dark:text-amber-200 text-xs">
                          Embedded View Detected
                        </p>
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">
                          Open in a full browser window to enable native browser app installation and camera permissions.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => window.open(window.location.origin + "/login", "_blank")}
                        className="py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1.5 flex-shrink-0"
                      >
                        <ExternalLink size={13} /> Open Standalone
                      </button>
                    </div>
                  )}

                  <div className="space-y-2.5 text-slate-700 dark:text-slate-300">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      How to install via Chrome, Edge, or Brave:
                    </p>
                    <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                        1
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        Look at the right side of your <strong>browser address bar</strong> at the top.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                        2
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        Click the <strong>Install icon (⤓ or ⊕)</strong>, or open the browser menu (
                        <strong>⋮</strong> or <strong>⋯</strong>) and select{" "}
                        <strong>&quot;Install KryptonVision&quot;</strong>.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                        3
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        Click <strong>Install</strong>. KryptonVision will launch in its own standalone window and add a desktop/start menu shortcut!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeInstallTab === "ios" && (
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    How to install on iPhone or iPad:
                  </p>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Make sure you are opening this page in <strong>Apple Safari</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Tap the <strong>Share</strong> button (the square icon with an upward arrow ⎋ at the bottom toolbar).
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong> (➕).
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      4
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Tap <strong>Add</strong> in the top-right corner. KryptonVision will now appear on your iPhone home screen!
                    </p>
                  </div>
                </div>
              )}

              {activeInstallTab === "android" && (
                <div className="space-y-3 text-slate-700 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    How to install on Android:
                  </p>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Tap the <strong>three dots (⋮)</strong> in the top-right corner of Google Chrome.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Tap <strong>&quot;Install App&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Tap <strong>Install</strong> to add the native app shortcut to your home screen and app drawer.
                    </p>
                  </div>
                </div>
              )}

              {/* Native App Benefits */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Desktop Application Benefits:
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    <span>Clean Standalone Window</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    <span>Instant Desktop Launch</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    <span>No Browser URL Bar</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    <span>Direct Camera &amp; AI Access</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
