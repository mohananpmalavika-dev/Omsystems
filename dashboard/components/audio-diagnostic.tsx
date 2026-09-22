"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX, AlertCircle, CheckCircle, XCircle } from "lucide-react";

interface AudioDiagnosticProps {
  videoElement: HTMLVideoElement | null;
  cameraId: string;
  cameraName: string;
}

export function AudioDiagnostic({ videoElement, cameraId, cameraName }: AudioDiagnosticProps) {
  const [diagnostics, setDiagnostics] = useState({
    hasVideoElement: false,
    hasAudioTracks: false,
    audioTrackCount: 0,
    audioEnabled: false,
    muted: true,
    volume: 0,
    audioContext: false,
    browserPolicy: "unknown",
    streamHasAudio: false,
  });

  useEffect(() => {
    if (!videoElement) {
      setDiagnostics({
        hasVideoElement: false,
        hasAudioTracks: false,
        audioTrackCount: 0,
        audioEnabled: false,
        muted: true,
        volume: 0,
        audioContext: false,
        browserPolicy: "unknown",
        streamHasAudio: false,
      });
      return;
    }

    const checkAudio = () => {
      const mediaStream = (videoElement as any).captureStream?.() || (videoElement as any).mozCaptureStream?.();
      let audioTracks: MediaStreamTrack[] = [];
      let streamHasAudio = false;

      if (mediaStream) {
        audioTracks = mediaStream.getAudioTracks();
        streamHasAudio = audioTracks.length > 0 && audioTracks.some((track: MediaStreamTrack) => track.enabled);
      }

      // Check if video element source has audio
      const hasAudioAttribute = videoElement.querySelector('source[type*="audio"]') !== null;
      
      setDiagnostics({
        hasVideoElement: true,
        hasAudioTracks: audioTracks.length > 0,
        audioTrackCount: audioTracks.length,
        audioEnabled: audioTracks.some((track: MediaStreamTrack) => track.enabled),
        muted: videoElement.muted,
        volume: videoElement.volume,
        audioContext: typeof AudioContext !== "undefined",
        browserPolicy: videoElement.muted ? "requires-interaction" : "allowed",
        streamHasAudio,
      });
    };

    // Check immediately
    checkAudio();

    // Check when video starts playing
    const handleLoadedMetadata = () => checkAudio();
    const handlePlay = () => checkAudio();
    
    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoElement.addEventListener("play", handlePlay);

    // Periodic check
    const interval = setInterval(checkAudio, 2000);

    return () => {
      clearInterval(interval);
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.removeEventListener("play", handlePlay);
    };
  }, [videoElement]);

  const testAudioClick = async () => {
    if (!videoElement) return;
    
    try {
      videoElement.muted = false;
      videoElement.volume = 1;
      await videoElement.play();
      alert("Audio test: Video should now be playing with audio unmuted at full volume.");
    } catch (error) {
      alert(`Audio test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="audio-diagnostic-panel">
      <div className="diagnostic-header">
        <Volume2 size={16} />
        <h3>Audio Diagnostics - {cameraName}</h3>
      </div>

      <div className="diagnostic-items">
        <DiagnosticItem
          label="Video Element"
          status={diagnostics.hasVideoElement}
          details={diagnostics.hasVideoElement ? "Connected" : "Not found"}
        />
        
        <DiagnosticItem
          label="Audio Tracks in Stream"
          status={diagnostics.hasAudioTracks}
          details={diagnostics.hasAudioTracks ? `${diagnostics.audioTrackCount} track(s)` : "No audio tracks detected"}
          critical={true}
        />

        <DiagnosticItem
          label="Audio Track Status"
          status={diagnostics.audioEnabled}
          details={diagnostics.audioEnabled ? "Enabled" : "Disabled or not available"}
        />

        <DiagnosticItem
          label="Muted State"
          status={!diagnostics.muted}
          details={diagnostics.muted ? "Muted (click volume button)" : "Unmuted"}
        />

        <DiagnosticItem
          label="Volume Level"
          status={diagnostics.volume > 0}
          details={`${Math.round(diagnostics.volume * 100)}%`}
        />

        <DiagnosticItem
          label="Stream Has Audio"
          status={diagnostics.streamHasAudio}
          details={diagnostics.streamHasAudio ? "Audio detected in media stream" : "No audio in stream"}
          critical={true}
        />

        <DiagnosticItem
          label="Browser Audio API"
          status={diagnostics.audioContext}
          details={diagnostics.audioContext ? "Supported" : "Not supported"}
        />
      </div>

      <div className="diagnostic-actions">
        <button 
          className="diagnostic-button"
          onClick={testAudioClick}
          disabled={!videoElement}
        >
          Test Audio Playback
        </button>
      </div>

      {!diagnostics.hasAudioTracks && diagnostics.hasVideoElement && (
        <div className="diagnostic-warning">
          <AlertCircle size={16} />
          <div>
            <strong>No Audio Track Detected</strong>
            <p>The camera's RTSP stream might not include an audio channel. Check:</p>
            <ul>
              <li>Camera has a built-in microphone</li>
              <li>Audio is enabled in camera settings</li>
              <li>RTSP URL includes audio stream</li>
              <li>Audio codec is supported (AAC, PCMU, PCMA)</li>
            </ul>
          </div>
        </div>
      )}

      <style jsx>{`
        .audio-diagnostic-panel {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(15, 23, 42, 0.98);
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 20px;
          min-width: 400px;
          max-width: 500px;
          z-index: 100;
          backdrop-filter: blur(10px);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
        }

        .diagnostic-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
          color: #f1f5f9;
          font-size: 16px;
          font-weight: 600;
        }

        .diagnostic-items {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }

        .diagnostic-actions {
          display: flex;
          justify-content: center;
          margin-top: 16px;
        }

        .diagnostic-button {
          padding: 10px 20px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .diagnostic-button:hover:not(:disabled) {
          background: #2563eb;
        }

        .diagnostic-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .diagnostic-warning {
          margin-top: 16px;
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #fca5a5;
          display: flex;
          gap: 12px;
        }

        .diagnostic-warning strong {
          display: block;
          margin-bottom: 6px;
          color: #ef4444;
        }

        .diagnostic-warning p {
          margin: 6px 0;
          font-size: 13px;
        }

        .diagnostic-warning ul {
          margin: 8px 0 0 0;
          padding-left: 20px;
          font-size: 12px;
        }

        .diagnostic-warning li {
          margin: 4px 0;
        }
      `}</style>
    </div>
  );
}

function DiagnosticItem({ 
  label, 
  status, 
  details,
  critical = false 
}: { 
  label: string; 
  status: boolean; 
  details: string;
  critical?: boolean;
}) {
  return (
    <div className="diagnostic-item">
      <div className="diagnostic-item-header">
        {status ? (
          <CheckCircle size={16} className="status-icon success" />
        ) : (
          <XCircle size={16} className={`status-icon ${critical ? 'critical' : 'warning'}`} />
        )}
        <span className="diagnostic-label">{label}</span>
      </div>
      <span className="diagnostic-details">{details}</span>

      <style jsx>{`
        .diagnostic-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: rgba(30, 41, 59, 0.5);
          border-radius: 6px;
          font-size: 13px;
        }

        .diagnostic-item-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .diagnostic-label {
          color: #cbd5e1;
          font-weight: 500;
        }

        .diagnostic-details {
          color: #94a3b8;
          font-size: 12px;
        }

        .status-icon {
          flex-shrink: 0;
        }

        .status-icon.success {
          color: #10b981;
        }

        .status-icon.warning {
          color: #f59e0b;
        }

        .status-icon.critical {
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}
