"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Video,
  Mic,
  MicOff,
  Zap,
  ZapOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Activity,
  Battery,
  Wifi,
  Square,
  Smartphone,
  Laptop,
  Globe,
} from "lucide-react";

type StreamState = "INITIALIZING" | "PERMISSION_CONSENT" | "ENROLLING" | "STARTING" | "LIVE" | "RECONNECTING" | "STOPPED" | "ERROR";

export default function PortableCameraEnrollPage() {
  const [token, setToken] = useState<string>("");
  const [streamState, setStreamState] = useState<StreamState>("INITIALIZING");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Enrollment & Device Info
  const [enrollmentInfo, setEnrollmentInfo] = useState<any>(null);
  const [deviceName, setDeviceName] = useState<string>("");
  const [deviceType, setDeviceType] = useState<"ANDROID" | "IOS" | "WINDOWS" | "BROWSER">("BROWSER");
  const [allowMic, setAllowMic] = useState<boolean>(true);
  const [allowLocation, setAllowLocation] = useState<boolean>(true);

  // Active Session & Stream Info
  const [session, setSession] = useState<any>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [micEnabled, setMicEnabled] = useState<boolean>(true);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);

  // Telemetry
  const [fps, setFps] = useState<number>(25);
  const [resolution, setResolution] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [networkQuality, setNetworkQuality] = useState<"EXCELLENT" | "GOOD" | "POOR">("GOOD");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const telemetryTimerRef = useRef<any>(null);
  const durationTimerRef = useRef<any>(null);

  // 1. Detect environment and parse token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setStreamState("ERROR");
      setErrorMessage("No enrollment token found. Please scan a valid QR code from the VMS.");
      return;
    }
    setToken(t);

    // Detect device type
    const ua = navigator.userAgent.toLowerCase();
    let detectedType: "ANDROID" | "IOS" | "WINDOWS" | "BROWSER" = "BROWSER";
    let defaultName = "Browser Camera";

    if (ua.includes("android")) {
      detectedType = "ANDROID";
      defaultName = "Android Mobile Camera";
    } else if (ua.includes("iphone") || ua.includes("ipad")) {
      detectedType = "IOS";
      defaultName = "iPhone Camera";
    } else if (ua.includes("windows")) {
      detectedType = "WINDOWS";
      defaultName = "Windows Laptop Camera";
    }
    setDeviceType(detectedType);
    setDeviceName(defaultName);

    // Battery API
    if ("getBattery" in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener("levelchange", () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => undefined);
    }

    // Validate enrollment token
    fetch(`/api/portable-camera/enrollments/${t}`)
      .then((res) => {
        if (!res.ok) throw new Error("Enrollment session is invalid, expired, or has already been consumed.");
        return res.json();
      })
      .then((data) => {
        setEnrollmentInfo(data);
        setStreamState("PERMISSION_CONSENT");
      })
      .catch((err) => {
        setStreamState("ERROR");
        setErrorMessage(err.message || "Failed to validate enrollment token.");
      });

    return () => {
      cleanupStream();
    };
  }, []);

  // Enumerate video devices
  const refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(cams);
      if (cams.length > 0 && !selectedVideoDeviceId) {
        setSelectedVideoDeviceId(cams[0].deviceId);
      }
    } catch {}
  };

  // 2. Start Camera Capture and WHIP Publish
  const handleStartCapture = async () => {
    try {
      setStreamState("ENROLLING");
      setErrorMessage("");

      // 1. Enroll device
      const enrollRes = await fetch("/api/portable-camera/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          deviceType,
          deviceName,
          branchId: enrollmentInfo?.branchId,
        }),
      });

      if (!enrollRes.ok) {
        const err = await enrollRes.json().catch(() => ({}));
        throw new Error(err.error || "Device enrollment rejected by VMS.");
      }
      const enrollData = await enrollRes.json();
      const deviceId = enrollData.device.id;
      const cameraId = enrollData.camera.id;

      setStreamState("STARTING");

      // 2. Acquire media stream with requested constraints
      const constraints: MediaStreamConstraints = {
        video: selectedVideoDeviceId
          ? { deviceId: { exact: selectedVideoDeviceId } }
          : { facingMode: facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: allowMic ? { echoCancellation: true, noiseSuppression: true } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => undefined);
      }

      // Check track resolution and capabilities
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings.width && settings.height) {
          setResolution({ width: settings.width, height: settings.height });
        }
        if (settings.frameRate) {
          setFps(Math.round(settings.frameRate));
        }
        // Check torch support
        const caps = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as any;
        setHasTorch(Boolean(caps.torch));
      }

      await refreshDevices();

      // 3. Start portable session on Control Plane
      const sessionRes = await fetch("/api/portable-camera/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          sourceId: cameraId,
          branchId: enrollmentInfo?.branchId,
          recordingPolicy: "RECORD_WHILE_LIVE",
          videoCodec: "H264",
          audioCodec: allowMic ? "OPUS" : undefined,
          resolution: { width: 1920, height: 1080 },
          fps: 25,
        }),
      });

      if (!sessionRes.ok) {
        const err = await sessionRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start streaming session on media node.");
      }
      const sessionData = await sessionRes.json();
      setSession({ ...sessionData.session, publish: sessionData.publish, deviceId, cameraId });

      // 4. Publish via WebRTC WHIP
      await publishWhipStream(stream, sessionData.publish);

      setStreamState("LIVE");

      // Start duration counter
      setElapsedSeconds(0);
      durationTimerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Start periodic health telemetry
      startTelemetry(sessionData.session.id);
    } catch (err: any) {
      console.error("Failed to start portable camera:", err);
      setStreamState("ERROR");
      setErrorMessage(err.message || "Failed to start camera. Please verify permissions and network.");
      cleanupStream();
    }
  };

  // WebRTC WHIP Handshake
  const publishWhipStream = async (stream: MediaStream, publishInfo: { whipUrl: string; publishToken: string }) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    peerConnectionRef.current = pc;

    // Add local tracks to peer connection
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        setStreamState("RECONNECTING");
        setNetworkQuality("POOR");
      } else if (pc.iceConnectionState === "connected") {
        setStreamState("LIVE");
        setNetworkQuality("GOOD");
      }
    };

    // Create SDP Offer
    const offer = await pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", checkState);
        setTimeout(resolve, 1500); // 1.5s max gather timeout
      }
    });

    // POST offer to WHIP endpoint
    const whipResponse = await fetch(publishInfo.whipUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        "Authorization": `Bearer ${publishInfo.publishToken}`,
      },
      body: pc.localDescription?.sdp,
    });

    if (!whipResponse.ok) {
      const errText = await whipResponse.text().catch(() => "");
      throw new Error(`Media Gateway WHIP publish rejected (${whipResponse.status}): ${errText}`);
    }

    const sdpAnswer = await whipResponse.text();
    await pc.setRemoteDescription({
      type: "answer",
      sdp: sdpAnswer,
    });
  };

  // Periodic Telemetry Reporting
  const startTelemetry = (sessionId: string) => {
    if (telemetryTimerRef.current) clearInterval(telemetryTimerRef.current);
    telemetryTimerRef.current = setInterval(async () => {
      let locationData = undefined;
      if (allowLocation && "geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 });
          });
          locationData = {
            available: true,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
          };
        } catch {
          locationData = { available: false };
        }
      }

      // Check WebRTC stats
      let rtt = 30;
      let packetLoss = 0;
      if (peerConnectionRef.current) {
        try {
          const stats = await peerConnectionRef.current.getStats();
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.currentRoundTripTime) {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
          });
        } catch {}
      }

      await fetch(`/api/portable-camera/sessions/${sessionId}/health`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectivity: streamState === "RECONNECTING" ? "DEGRADED" : "HEALTHY",
          fps,
          bitrateKbps: 2000,
          packetLossPercent: packetLoss,
          jitterMs: 5,
          rttMs: rtt,
          batteryPercent: batteryLevel ?? undefined,
          thermalState: "nominal",
          recordingState: "RECORDING",
          location: locationData,
        }),
      }).catch(() => undefined);
    }, 5000);
  };

  // Switch between Front & Rear camera
  const handleSwitchCamera = async () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: nextMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: allowMic ? { echoCancellation: true, noiseSuppression: true } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Replace tracks in PeerConnection
      if (peerConnectionRef.current) {
        const videoTrack = stream.getVideoTracks()[0];
        const senders = peerConnectionRef.current.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === "video");
        if (videoSender && videoTrack) {
          await videoSender.replaceTrack(videoTrack);
        }
      }
    } catch (err) {
      console.warn("Failed to switch camera:", err);
    }
  };

  // Toggle Microphone Mute
  const handleToggleMic = () => {
    if (!mediaStreamRef.current) return;
    const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicEnabled(audioTrack.enabled);
    }
  };

  // Toggle Flashlight/Torch on mobile devices
  const handleToggleTorch = async () => {
    if (!mediaStreamRef.current) return;
    const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const nextState = !torchEnabled;
        await (videoTrack as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchEnabled(nextState);
      } catch (err) {
        console.warn("Torch constraint not supported on this device/track", err);
      }
    }
  };

  // Stop Camera Session
  const handleStopCamera = async () => {
    if (session?.id) {
      await fetch(`/api/portable-camera/sessions/${session.id}/stop`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "user_clicked_stop" }),
      }).catch(() => undefined);
    }
    cleanupStream();
    setStreamState("STOPPED");
  };

  const cleanupStream = () => {
    if (telemetryTimerRef.current) clearInterval(telemetryTimerRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#090d16",
      color: "#f8fafc",
      display: "flex",
      flexDirection: "column",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Top Header */}
      <header style={{
        padding: "16px 20px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#0d1322",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            backgroundColor: "#2563eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
          }}>
            <Video size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>PORTABLE CAMERA</h1>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Sentinel Grid Enterprise VMS</span>
          </div>
        </div>

        {streamState === "LIVE" && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            backgroundColor: "rgba(220, 38, 38, 0.2)",
            border: "1px solid rgba(220, 38, 38, 0.6)",
            borderRadius: "20px",
            fontWeight: 700,
            fontSize: "13px",
            color: "#ef4444",
            letterSpacing: "0.5px",
          }}>
            <span style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#ef4444",
              display: "inline-block",
              boxShadow: "0 0 10px #ef4444",
              animation: "pulse 1.5s infinite",
            }} />
            🔴 CAMERA LIVE TO VMS
          </div>
        )}
      </header>

      {/* Main View Area */}
      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        position: "relative",
      }}>
        {/* State 1: Consent & Setup */}
        {streamState === "PERMISSION_CONSENT" && (
          <div style={{
            maxWidth: "480px",
            width: "100%",
            backgroundColor: "#111827",
            borderRadius: "16px",
            padding: "28px",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
          }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "rgba(59, 130, 246, 0.15)",
                color: "#60a5fa",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "12px",
              }}>
                {deviceType === "ANDROID" || deviceType === "IOS" ? <Smartphone size={28} /> : <Laptop size={28} />}
              </div>
              <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 6px 0" }}>Enroll Portable Device</h2>
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                This device will securely publish video as an authorized CCTV source.
              </p>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                Device Display Name
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  color: "#f8fafc",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
                placeholder="e.g. Engineer Phone 07"
              />
            </div>

            <div style={{
              backgroundColor: "#0f172a",
              borderRadius: "10px",
              padding: "14px",
              marginBottom: "20px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#94a3b8", marginBottom: "10px", textTransform: "uppercase" }}>
                Permissions & Privacy
              </div>
              
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                  <Camera size={16} color="#3b82f6" /> Camera Stream
                </div>
                <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 600 }}>Required</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                  <Mic size={16} color="#eab308" /> Transmit Audio
                </div>
                <input
                  type="checkbox"
                  checked={allowMic}
                  onChange={(e) => setAllowMic(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                  <Globe size={16} color="#a855f7" /> Attach GPS Location
                </div>
                <input
                  type="checkbox"
                  checked={allowLocation}
                  onChange={(e) => setAllowLocation(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
              </div>
            </div>

            <div style={{
              backgroundColor: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "12px",
              color: "#93c5fd",
              marginBottom: "24px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}>
              <Shield size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>
                Streaming state and recording indicators will always remain visible on this screen. Silent surveillance is disabled.
              </span>
            </div>

            <button
              onClick={handleStartCapture}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "10px",
                backgroundColor: "#2563eb",
                border: "none",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)",
              }}
            >
              <Video size={18} /> START LIVE CAMERA
            </button>
          </div>
        )}

        {/* State 2: Live Streaming Video UI */}
        {(streamState === "LIVE" || streamState === "RECONNECTING" || streamState === "STARTING" || streamState === "ENROLLING") && (
          <div style={{
            maxWidth: "720px",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            {/* Viewport Frame */}
            <div style={{
              width: "100%",
              aspectRatio: "16/9",
              backgroundColor: "#000000",
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
              border: "2px solid rgba(255, 255, 255, 0.15)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
            }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />

              {/* Status Badge overlay */}
              <div style={{
                position: "absolute",
                top: "14px",
                left: "14px",
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                backdropFilter: "blur(8px)",
                padding: "6px 12px",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                fontWeight: 600,
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}>
                <span style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: streamState === "LIVE" ? "#10b981" : "#eab308",
                }} />
                {streamState === "LIVE" ? "STREAMING LIVE" : "CONNECTING..."}
                <span style={{ color: "#94a3b8" }}>·</span>
                <span>{formatDuration(elapsedSeconds)}</span>
              </div>

              {/* Recording indicator overlay */}
              <div style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                backgroundColor: "rgba(220, 38, 38, 0.8)",
                backdropFilter: "blur(8px)",
                padding: "6px 12px",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#ffffff",
              }}>
                <Square size={10} fill="#ffffff" />
                REC ON
              </div>

              {/* Bottom Telemetry Bar on Video */}
              <div style={{
                position: "absolute",
                bottom: "0",
                left: "0",
                right: "0",
                padding: "10px 16px",
                background: "linear-gradient(transparent, rgba(0, 0, 0, 0.85))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "11px",
                color: "#cbd5e1",
              }}>
                <div>
                  {resolution.width}x{resolution.height} · {fps} FPS · 2.0 Mbps
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Wifi size={13} color="#10b981" /> {networkQuality}
                  </span>
                  {batteryLevel !== null && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Battery size={13} color={batteryLevel < 20 ? "#ef4444" : "#10b981"} /> {batteryLevel}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive Hardware Controls */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              marginTop: "20px",
              width: "100%",
            }}>
              <button
                onClick={handleSwitchCamera}
                title="Switch between front and rear camera"
                style={{
                  padding: "12px 18px",
                  borderRadius: "10px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  color: "#f8fafc",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <RefreshCw size={15} /> Switch Camera
              </button>

              <button
                onClick={handleToggleMic}
                title={micEnabled ? "Mute Microphone" : "Unmute Microphone"}
                style={{
                  padding: "12px 18px",
                  borderRadius: "10px",
                  backgroundColor: micEnabled ? "#1e293b" : "rgba(239, 68, 68, 0.2)",
                  border: `1px solid ${micEnabled ? "#334155" : "rgba(239, 68, 68, 0.6)"}`,
                  color: micEnabled ? "#f8fafc" : "#ef4444",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {micEnabled ? <Mic size={15} /> : <MicOff size={15} />}
                {micEnabled ? "Mic On" : "Mic Muted"}
              </button>

              {hasTorch && (
                <button
                  onClick={handleToggleTorch}
                  title="Toggle Camera Flashlight"
                  style={{
                    padding: "12px 18px",
                    borderRadius: "10px",
                    backgroundColor: torchEnabled ? "rgba(234, 179, 8, 0.2)" : "#1e293b",
                    border: `1px solid ${torchEnabled ? "rgba(234, 179, 8, 0.6)" : "#334155"}`,
                    color: torchEnabled ? "#eab308" : "#f8fafc",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {torchEnabled ? <Zap size={15} /> : <ZapOff size={15} />}
                  Torch
                </button>
              )}

              <button
                onClick={handleStopCamera}
                style={{
                  padding: "12px 24px",
                  borderRadius: "10px",
                  backgroundColor: "#dc2626",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 4px 10px rgba(220, 38, 38, 0.4)",
                  marginLeft: "auto",
                }}
              >
                <Square size={14} fill="#ffffff" /> STOP CAMERA
              </button>
            </div>
          </div>
        )}

        {/* State 3: Session Ended Summary */}
        {streamState === "STOPPED" && (
          <div style={{
            maxWidth: "440px",
            width: "100%",
            backgroundColor: "#111827",
            borderRadius: "16px",
            padding: "28px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            textAlign: "center",
          }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "14px",
            }}>
              <CheckCircle2 size={30} />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px 0" }}>Camera Session Concluded</h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px 0" }}>
              Total Stream Duration: <strong>{formatDuration(elapsedSeconds)}</strong>. Recording has been finalized and indexed into the VMS archive.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 20px",
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "13px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Start New Session
            </button>
          </div>
        )}

        {/* State 4: Error View */}
        {streamState === "ERROR" && (
          <div style={{
            maxWidth: "440px",
            width: "100%",
            backgroundColor: "rgba(220, 38, 38, 0.1)",
            border: "1px solid rgba(220, 38, 38, 0.4)",
            borderRadius: "16px",
            padding: "24px",
            textAlign: "center",
          }}>
            <AlertTriangle size={36} color="#ef4444" style={{ marginBottom: "12px" }} />
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#f87171", margin: "0 0 8px 0" }}>Enrollment Error</h2>
            <p style={{ fontSize: "13px", color: "#cbd5e1", margin: "0 0 18px 0" }}>{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 16px",
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
