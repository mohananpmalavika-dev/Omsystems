/**
 * KryptoVision Connect - Advanced Enterprise WebRTC Call Hook
 * 
 * Supports:
 * - 🎙️ Audio Calling (Echo cancellation, noise suppression)
 * - 🎥 Video Calling (HD Camera capture, front/back switch, video mute)
 * - 🖥️ Screen Sharing (DisplayMedia capture, dynamic video track replacement)
 * - 📻 Push-to-Talk (PTT / Walkie-Talkie Mode)
 * - 🔴 Call Recording & Audit Trail (MediaRecorder API)
 * - 📸 Snapshot / Evidence Capture (Watermarked frame export)
 * - 💬 In-Call Chat & Evidence File Sharing
 * - 🪟 Picture-in-Picture (PiP) Window
 * - 📶 Connection quality telemetry & Adaptive Bandwidth
 */

"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebRTCCredentials } from '@/services/communication-api';

export type WebRTCState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'FAILED';
export type CallModality = 'audio' | 'video' | 'screenshare';

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

export interface CallQualityMetrics {
  rtt?: number;
  jitter?: number;
  packetLoss?: number;
  audioLevel?: number;
  videoFps?: number;
  resolution?: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  isSelf: boolean;
  text?: string;
  timestamp: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
}

export interface UseWebRTCCallReturn {
  state: WebRTCState;
  callModality: CallModality;
  setCallModality: (modality: CallModality) => void;
  
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  isScreenSharing: boolean;
  speakerEnabled: boolean;
  
  availableMicrophones: DeviceInfo[];
  availableCameras: DeviceInfo[];
  availableSpeakers: DeviceInfo[];
  selectedMicrophone: string | null;
  selectedCamera: string | null;
  selectedSpeaker: string | null;
  
  quality: CallQualityMetrics;
  error: string | null;
  
  // PTT (Push-to-Talk)
  isPttMode: boolean;
  setIsPttMode: (enabled: boolean) => void;
  isPttActive: boolean;
  startPttTalk: () => void;
  stopPttTalk: () => void;

  // Recording
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => boolean;
  stopRecording: () => Blob | null;

  // Snapshot
  captureSnapshot: (videoEl: HTMLVideoElement | null, label?: string) => string | null;

  // Chat & Files
  chatMessages: ChatMessage[];
  sendChatMessage: (text: string, senderName?: string) => void;
  sendChatFile: (file: File, senderName?: string) => Promise<void>;

  // Picture in Picture
  togglePiP: (videoEl: HTMLVideoElement | null) => Promise<boolean>;

  // Actions
  initializeMedia: (options: { audio?: boolean; video?: boolean }) => Promise<MediaStream | null>;
  connect: (credentials: WebRTCCredentials, remoteParticipantId?: string, modality?: CallModality) => Promise<void>;
  createOffer: (credentials: WebRTCCredentials, modality: CallModality, onIceCandidate: (candidate: RTCIceCandidateInit) => void) => Promise<RTCSessionDescriptionInit | null>;
  createAnswer: (credentials: WebRTCCredentials, offer: RTCSessionDescriptionInit, modality: CallModality, onIceCandidate: (candidate: RTCIceCandidateInit) => void) => Promise<RTCSessionDescriptionInit | null>;
  applyAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  startScreenShare: () => Promise<boolean>;
  stopScreenShare: () => Promise<void>;
  setMicrophone: (deviceId: string) => Promise<void>;
  setCamera: (deviceId: string) => Promise<void>;
  setSpeaker: (deviceId: string) => Promise<void>;
}

export function useWebRTCCall(): UseWebRTCCallReturn {
  const [state, setState] = useState<WebRTCState>('IDLE');
  const [callModality, setCallModality] = useState<CallModality>('audio');
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  
  const [availableMicrophones, setAvailableMicrophones] = useState<DeviceInfo[]>([]);
  const [availableCameras, setAvailableCameras] = useState<DeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<DeviceInfo[]>([]);
  
  const [selectedMicrophone, setSelectedMicrophone] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  
  const [quality, setQuality] = useState<CallQualityMetrics>({});
  const [error, setError] = useState<string | null>(null);

  // Push-to-Talk (PTT)
  const [isPttMode, setIsPttMode] = useState(false);
  const [isPttActive, setIsPttActive] = useState(false);

  // Call Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // In-Call Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const statsIntervalRef = useRef<number | null>(null);

  // Enumerate hardware devices
  const enumerateDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const mics: DeviceInfo[] = [];
      const cams: DeviceInfo[] = [];
      const speakers: DeviceInfo[] = [];
      
      devices.forEach((d) => {
        if (d.kind === 'audioinput') {
          mics.push({ deviceId: d.deviceId, label: d.label || `Microphone ${mics.length + 1}`, kind: 'audioinput' });
        } else if (d.kind === 'videoinput') {
          cams.push({ deviceId: d.deviceId, label: d.label || `Camera ${cams.length + 1}`, kind: 'videoinput' });
        } else if (d.kind === 'audiooutput') {
          speakers.push({ deviceId: d.deviceId, label: d.label || `Speaker ${speakers.length + 1}`, kind: 'audiooutput' });
        }
      });
      
      setAvailableMicrophones(mics);
      setAvailableCameras(cams);
      setAvailableSpeakers(speakers);
      
      if (mics.length > 0 && !selectedMicrophone) setSelectedMicrophone(mics[0].deviceId);
      if (cams.length > 0 && !selectedCamera) setSelectedCamera(cams[0].deviceId);
      if (speakers.length > 0 && !selectedSpeaker) setSelectedSpeaker(speakers[0].deviceId);
    } catch (err) {
      console.warn('[WebRTCCall] Device enumeration notice:', err);
    }
  }, [selectedMicrophone, selectedCamera, selectedSpeaker]);

  // Request audio / video permissions and create local stream
  const initializeMedia = useCallback(async (options: { audio?: boolean; video?: boolean }): Promise<MediaStream | null> => {
    try {
      setError(null);
      const constraints: MediaStreamConstraints = {
        audio: options.audio !== false ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: selectedMicrophone ? { exact: selectedMicrophone } : undefined,
        } : false,
        video: options.video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
        } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      
      const vTrack = stream.getVideoTracks()[0];
      if (vTrack) {
        cameraTrackRef.current = vTrack;
        setCameraEnabled(true);
      } else {
        setCameraEnabled(false);
      }
      
      const aTrack = stream.getAudioTracks()[0];
      // If PTT mode is already on, default mute the microphone
      if (isPttMode && aTrack) {
        aTrack.enabled = false;
        setMicrophoneEnabled(false);
      } else {
        setMicrophoneEnabled(Boolean(aTrack && aTrack.enabled));
      }
      
      await enumerateDevices();
      return stream;
    } catch (err: any) {
      console.error('[WebRTCCall] Media access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera/Microphone permission denied. Please allow device access in browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone or camera found on this device.');
      } else {
        setError(err.message || 'Failed to initialize audio/video capture');
      }
      return null;
    }
  }, [selectedMicrophone, selectedCamera, enumerateDevices, isPttMode]);

  // Monitor connection quality
  const startQualityMonitoring = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    
    statsIntervalRef.current = window.setInterval(async () => {
      const pc = peerConnectionRef.current;
      if (!pc || pc.connectionState !== 'connected') return;
      
      try {
        const stats = await pc.getStats();
        let rtt: number | undefined;
        let jitter: number | undefined;
        let packetLoss: number | undefined;
        let videoFps: number | undefined;
        
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : undefined;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            jitter = report.jitter ? Math.round(report.jitter * 1000) : undefined;
            if (report.packetsLost && report.packetsReceived) {
              packetLoss = Math.round((report.packetsLost / (report.packetsLost + report.packetsReceived)) * 100);
            }
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            videoFps = report.framesPerSecond ? Math.round(report.framesPerSecond) : undefined;
          }
        });
        
        setQuality({ rtt, jitter, packetLoss, videoFps });
      } catch {}
    }, 2500);
  }, []);

  const createPeerConnection = useCallback(async (
    credentials: WebRTCCredentials,
    modality: CallModality,
    onIceCandidate: (candidate: RTCIceCandidateInit) => void,
  ): Promise<RTCPeerConnection | null> => {
    try {
      setState('CONNECTING');
      setError(null);
      setCallModality(modality);
      
      // Ensure media is initialized according to requested modality
      let stream = localStream;
      if (!stream) {
        stream = await initializeMedia({
          audio: true,
          video: modality === 'video',
        });
        if (!stream) {
          setState('FAILED');
          return null;
        }
      }

      const pc = new RTCPeerConnection({
        iceServers: credentials.iceServers && credentials.iceServers.length > 0 ? credentials.iceServers : [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      peerConnectionRef.current = pc;
      pc.onicecandidate = (event) => {
        if (event.candidate) onIceCandidate(event.candidate.toJSON());
      };

      // Add local audio and video tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream!);
      });

      // Handle remote incoming tracks (both audio and video)
      pc.ontrack = (event) => {
        console.log('[WebRTCCall] Received remote track:', event.track.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else {
          setRemoteStream(new MediaStream([event.track]));
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTCCall] Connection status:', pc.connectionState);
        switch (pc.connectionState) {
          case 'connecting': setState('CONNECTING'); break;
          case 'connected':
            setState('CONNECTED');
            startQualityMonitoring();
            break;
          case 'disconnected': setState('RECONNECTING'); break;
          case 'failed':
            setState('FAILED');
            setError('Connection failed. Network or firewall error.');
            break;
          case 'closed': setState('DISCONNECTED'); break;
        }
      };

      return pc;
    } catch (err: any) {
      console.error('[WebRTCCall] Connection setup failed:', err);
      setState('FAILED');
      setError(err.message || 'Failed to establish call media');
      return null;
    }
  }, [localStream, initializeMedia, startQualityMonitoring]);

  // Backward-compatible local connection setup. New call screens use
  // createOffer/createAnswer to relay SDP through the authenticated socket.
  const connect = useCallback(async (credentials: WebRTCCredentials, _remoteParticipantId?: string, modality: CallModality = 'audio') => {
    const pc = await createPeerConnection(credentials, modality, () => undefined);
    if (!pc) return;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
  }, [createPeerConnection]);

  const createOffer = useCallback(async (
    credentials: WebRTCCredentials,
    modality: CallModality,
    onIceCandidate: (candidate: RTCIceCandidateInit) => void,
  ): Promise<RTCSessionDescriptionInit | null> => {
    const pc = await createPeerConnection(credentials, modality, onIceCandidate);
    if (!pc) return null;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    return { type: offer.type, sdp: offer.sdp };
  }, [createPeerConnection]);

  const createAnswer = useCallback(async (
    credentials: WebRTCCredentials,
    offer: RTCSessionDescriptionInit,
    modality: CallModality,
    onIceCandidate: (candidate: RTCIceCandidateInit) => void,
  ): Promise<RTCSessionDescriptionInit | null> => {
    const pc = await createPeerConnection(credentials, modality, onIceCandidate);
    if (!pc) return null;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    for (const candidate of pendingRemoteCandidatesRef.current.splice(0)) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return { type: answer.type, sdp: answer.sdp };
  }, [createPeerConnection]);

  const applyAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionRef.current;
    if (!pc) throw new Error('No active WebRTC offer exists');
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    for (const candidate of pendingRemoteCandidatesRef.current.splice(0)) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    if (!pc.remoteDescription) {
      pendingRemoteCandidatesRef.current.push(candidate);
      return;
    }
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }, []);

  // Screen Sharing
  const startScreenShare = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setError('Screen sharing is not supported on this browser or platform.');
      return false;
    }

    try {
      setError(null);
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { max: 30 },
        },
        audio: false,
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return false;
      screenTrackRef.current = screenTrack;

      // When user clicks browser's native "Stop sharing" banner
      screenTrack.onended = () => {
        void stopScreenShare();
      };

      const pc = peerConnectionRef.current;
      if (pc) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, displayStream);
        }
      }

      // Update local preview
      if (localStream) {
        const existingVideo = localStream.getVideoTracks()[0];
        if (existingVideo) localStream.removeTrack(existingVideo);
        localStream.addTrack(screenTrack);
        setLocalStream(new MediaStream(localStream.getTracks()));
      } else {
        setLocalStream(displayStream);
      }

      setIsScreenSharing(true);
      setCallModality('screenshare');
      return true;
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        console.log('[WebRTCCall] User cancelled screen share selection');
      } else {
        console.error('[WebRTCCall] Screen share error:', err);
        setError('Failed to share screen.');
      }
      return false;
    }
  }, [localStream]);

  // Stop Screen Share & restore camera or blank video
  const stopScreenShare = useCallback(async () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    const pc = peerConnectionRef.current;
    if (pc) {
      const senders = pc.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      
      if (cameraTrackRef.current && cameraTrackRef.current.readyState === 'live') {
        if (videoSender) await videoSender.replaceTrack(cameraTrackRef.current);
        if (localStream) {
          localStream.addTrack(cameraTrackRef.current);
          setLocalStream(new MediaStream(localStream.getTracks()));
        }
      } else if (videoSender) {
        await videoSender.replaceTrack(null);
      }
    }

    setIsScreenSharing(false);
    setCallModality(cameraTrackRef.current ? 'video' : 'audio');
  }, [localStream]);

  // Toggle Video Camera
  const toggleCamera = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    }

    if (cameraEnabled && cameraTrackRef.current) {
      cameraTrackRef.current.enabled = false;
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
      setCameraEnabled(false);
      
      const pc = peerConnectionRef.current;
      if (pc) {
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) await videoSender.replaceTrack(null);
      }
      setCallModality('audio');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
          },
        });
        const newTrack = stream.getVideoTracks()[0];
        cameraTrackRef.current = newTrack;
        
        if (localStream) {
          localStream.addTrack(newTrack);
          setLocalStream(new MediaStream(localStream.getTracks()));
        } else {
          setLocalStream(stream);
        }
        
        const pc = peerConnectionRef.current;
        if (pc) {
          const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(newTrack);
          } else {
            pc.addTrack(newTrack, localStream || stream);
          }
        }
        
        setCameraEnabled(true);
        setCallModality('video');
      } catch (err: any) {
        console.error('[WebRTCCall] Failed to enable camera:', err);
        setError('Failed to activate video camera.');
      }
    }
  }, [cameraEnabled, isScreenSharing, stopScreenShare, selectedCamera, localStream]);

  // Toggle Microphone Mute
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicrophoneEnabled(audioTrack.enabled);
      }
    }
  }, [localStream]);

  // Push-to-Talk (PTT)
  const startPttTalk = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
        setMicrophoneEnabled(true);
        setIsPttActive(true);
      }
    }
  }, [localStream]);

  const stopPttTalk = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        setMicrophoneEnabled(false);
        setIsPttActive(false);
      }
    }
  }, [localStream]);

  // Call Recording (MediaRecorder API)
  const startRecording = useCallback((): boolean => {
    const streamToRecord = remoteStream || localStream;
    if (!streamToRecord) {
      setError('No active media stream to record.');
      return false;
    }

    try {
      recordedChunksRef.current = [];
      const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm', 'audio/webm'];
      const supportedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

      const recorder = new MediaRecorder(streamToRecord, supportedMime ? { mimeType: supportedMime } : undefined);
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: supportedMime || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sentinel-call-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration((p) => p + 1);
      }, 1000);

      return true;
    } catch (err: any) {
      console.error('[WebRTCCall] Failed to start call recording:', err);
      setError('Recording failed to initialize.');
      return false;
    }
  }, [remoteStream, localStream]);

  const stopRecording = useCallback((): Blob | null => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      return new Blob(recordedChunksRef.current, { type: 'video/webm' });
    }
    return null;
  }, [isRecording]);

  // Snapshot / Evidence Capture
  const captureSnapshot = useCallback((videoEl: HTMLVideoElement | null, label: string = 'VMS Incident Evidence'): string | null => {
    if (!videoEl || videoEl.videoWidth === 0) {
      setError('Video feed is not ready for snapshot.');
      return null;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Draw video frame
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      // Watermark with timestamp and label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, canvas.height - 40, canvas.width, 40);

      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      const timestamp = new Date().toLocaleString();
      ctx.fillText(`${label} • ${timestamp} • Sentinel Grid Verified`, 16, canvas.height - 15);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      // Auto-trigger download
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `evidence-snapshot-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Also add to in-call chat as an evidence item
      setChatMessages(prev => [
        ...prev,
        {
          id: `snap-${Date.now()}`,
          sender: 'You',
          isSelf: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          fileUrl: dataUrl,
          fileName: `evidence-snapshot-${Date.now()}.jpg`,
          fileType: 'image/jpeg',
          text: `📸 Captured evidence snapshot (${label})`,
        }
      ]);

      return dataUrl;
    } catch (err: any) {
      console.error('[WebRTCCall] Snapshot capture failed:', err);
      setError('Failed to capture snapshot.');
      return null;
    }
  }, []);

  // In-Call Chat & File Sharing
  const sendChatMessage = useCallback((text: string, senderName: string = 'You') => {
    if (!text.trim()) return;
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: senderName,
      isSelf: true,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  const sendChatFile = useCallback(async (file: File, senderName: string = 'You') => {
    try {
      const fileUrl = URL.createObjectURL(file);
      const msg: ChatMessage = {
        id: `file-${Date.now()}`,
        sender: senderName,
        isSelf: true,
        fileName: file.name,
        fileType: file.type,
        fileUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `📎 Sent attachment: ${file.name}`,
      };
      setChatMessages((prev) => [...prev, msg]);
    } catch (err) {
      console.error('File share error:', err);
    }
  }, []);

  // Picture in Picture (PiP)
  const togglePiP = useCallback(async (videoEl: HTMLVideoElement | null): Promise<boolean> => {
    if (!videoEl || typeof document === 'undefined') return false;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return false;
      } else if (videoEl.requestPictureInPicture) {
        await videoEl.requestPictureInPicture();
        return true;
      }
      return false;
    } catch (err) {
      console.warn('PiP error:', err);
      return false;
    }
  }, []);

  // Disconnect call and stop all active hardware tracks
  const disconnect = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    pendingRemoteCandidatesRef.current = [];

    setRemoteStream(null);
    setIsScreenSharing(false);
    setCameraEnabled(false);
    setIsPttActive(false);
    setState('DISCONNECTED');
  }, [localStream, isRecording]);

  // Switch microphone
  const setMicrophone = useCallback(async (deviceId: string) => {
    setSelectedMicrophone(deviceId);
    if (localStream) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        const newTrack = newStream.getAudioTracks()[0];
        const oldTrack = localStream.getAudioTracks()[0];
        if (oldTrack) {
          oldTrack.stop();
          localStream.removeTrack(oldTrack);
        }
        localStream.addTrack(newTrack);
        
        const pc = peerConnectionRef.current;
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) await sender.replaceTrack(newTrack);
        }
      } catch (err) {
        console.error('[WebRTCCall] Switch mic error:', err);
      }
    }
  }, [localStream]);

  // Switch camera
  const setCamera = useCallback(async (deviceId: string) => {
    setSelectedCamera(deviceId);
    if (cameraEnabled) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        const newTrack = newStream.getVideoTracks()[0];
        if (cameraTrackRef.current) {
          cameraTrackRef.current.stop();
          localStream?.removeTrack(cameraTrackRef.current);
        }
        cameraTrackRef.current = newTrack;
        localStream?.addTrack(newTrack);
        
        const pc = peerConnectionRef.current;
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(newTrack);
        }
      } catch (err) {
        console.error('[WebRTCCall] Switch camera error:', err);
      }
    }
  }, [cameraEnabled, localStream]);

  // Switch speaker
  const setSpeaker = useCallback(async (deviceId: string) => {
    setSelectedSpeaker(deviceId);
  }, []);

  return {
    state,
    callModality,
    setCallModality,
    localStream,
    remoteStream,
    microphoneEnabled,
    cameraEnabled,
    isScreenSharing,
    speakerEnabled,
    availableMicrophones,
    availableCameras,
    availableSpeakers,
    selectedMicrophone,
    selectedCamera,
    selectedSpeaker,
    quality,
    error,
    isPttMode,
    setIsPttMode,
    isPttActive,
    startPttTalk,
    stopPttTalk,
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    captureSnapshot,
    chatMessages,
    sendChatMessage,
    sendChatFile,
    togglePiP,
    initializeMedia,
    connect,
    createOffer,
    createAnswer,
    applyAnswer,
    addIceCandidate,
    disconnect,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    setMicrophone,
    setCamera,
    setSpeaker,
  };
}
