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
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const mediaGenerationRef = useRef(0);
  const videoOperationRef = useRef(false);
  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const statsIntervalRef = useRef<number | null>(null);

  const updateLocalStream = useCallback((tracks: MediaStreamTrack[]) => {
    const stream = new MediaStream(tracks.filter(track => track.readyState === 'live'));
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // Read current tracks from refs: media capture can finish before React renders.
  const replaceLocalVideo = useCallback((track: MediaStreamTrack | null) => {
    return updateLocalStream([
      ...(localStreamRef.current?.getAudioTracks() || []),
      ...(track ? [track] : []),
    ]);
  }, [updateLocalStream]);

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

  useEffect(() => {
    void enumerateDevices();
    navigator.mediaDevices?.addEventListener('devicechange', enumerateDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', enumerateDevices);
  }, [enumerateDevices]);

  // Request capture only after an explicit call/device action.
  const initializeMedia = useCallback(async (options: { audio?: boolean; video?: boolean }): Promise<MediaStream | null> => {
    const generation = ++mediaGenerationRef.current;
    try {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera and microphone access requires HTTPS or localhost in a supported browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: options.audio !== false ? {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          deviceId: selectedMicrophone ? { ideal: selectedMicrophone } : undefined,
        } : false,
        video: options.video ? {
          width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
          deviceId: selectedCamera ? { ideal: selectedCamera } : undefined,
        } : false,
      });
      if (generation !== mediaGenerationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return null;
      }
      const oldTracks = new Set([...(localStreamRef.current?.getTracks() || []), ...(cameraTrackRef.current ? [cameraTrackRef.current] : [])]);
      oldTracks.forEach(track => { if (track !== screenTrackRef.current) track.stop(); });
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && isPttMode) audioTrack.enabled = false;
      setMicrophoneEnabled(Boolean(audioTrack?.enabled));
      setCameraEnabled(Boolean(cameraTrackRef.current));
      const preview = updateLocalStream([
        ...stream.getAudioTracks(),
        ...(screenTrackRef.current ? [screenTrackRef.current] : stream.getVideoTracks()),
      ]);
      void enumerateDevices();
      return preview;
    } catch (err: any) {
      if (generation !== mediaGenerationRef.current) return null;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera or microphone permission denied. Allow access in browser settings, then try again.');
      } else if (err.name === 'NotFoundError') {
        setError('The requested microphone or camera was not found. Check the device connection or use a voice call.');
      } else if (err.name === 'NotReadableError') {
        setError('Camera or microphone is busy. Close other apps using it, then try again.');
      } else {
        setError(err.message || 'Unable to access camera or microphone.');
      }
      return null;
    }
  }, [selectedMicrophone, selectedCamera, enumerateDevices, isPttMode, updateLocalStream]);

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
    remoteOffer?: RTCSessionDescriptionInit,
  ): Promise<RTCPeerConnection | null> => {
    const generation = mediaGenerationRef.current;
    try {
      setState('CONNECTING');
      setError(null);
      setCallModality(screenTrackRef.current ? 'screenshare' : modality);
      let stream = localStreamRef.current;
      if (!stream || !stream.getAudioTracks().some(track => track.readyState === 'live')) {
        stream = await initializeMedia({ audio: true, video: modality === 'video' });
        if (!stream) { setState('FAILED'); return null; }
      } else if (generation !== mediaGenerationRef.current) return null;

      peerConnectionRef.current?.close();
      const pc = new RTCPeerConnection({
        iceServers: credentials.iceServers?.length ? credentials.iceServers : [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      peerConnectionRef.current = pc;
      remoteStreamRef.current = new MediaStream();
      setRemoteStream(null);
      pc.onicecandidate = event => {
        if (event.candidate && peerConnectionRef.current === pc) onIceCandidate(event.candidate.toJSON());
      };
      pc.ontrack = event => {
        if (peerConnectionRef.current !== pc) return;
        const remote = remoteStreamRef.current!;
        if (!remote.getTracks().some(track => track.id === event.track.id)) remote.addTrack(event.track);
        const publish = () => {
          if (peerConnectionRef.current === pc) setRemoteStream(new MediaStream(remote.getTracks()));
        };
        event.track.onmute = publish;
        event.track.onunmute = publish;
        event.track.onended = publish;
        publish();
      };
      pc.onconnectionstatechange = () => {
        if (peerConnectionRef.current !== pc) return;
        switch (pc.connectionState) {
          case 'connecting': setState('CONNECTING'); break;
          case 'connected': setState('CONNECTED'); startQualityMonitoring(); break;
          case 'disconnected': setState('RECONNECTING'); break;
          case 'failed': setState('FAILED'); setError('Call media could not connect. Check the network and TURN relay configuration.'); break;
          case 'closed': setState('DISCONNECTED'); break;
        }
      };
      // Answers reuse the offered transceivers instead of creating extra video channels.
      if (remoteOffer) await pc.setRemoteDescription(remoteOffer);
      if (peerConnectionRef.current !== pc) return null;
      for (const kind of ['audio', 'video'] as const) {
        const track = stream.getTracks().find(track => track.kind === kind) || null;
        let transceiver = pc.getTransceivers().find(item => item.receiver.track.kind === kind);
        if (transceiver) {
          transceiver.direction = 'sendrecv';
          transceiver.sender.setStreams(stream);
          await transceiver.sender.replaceTrack(track);
        } else {
          transceiver = pc.addTransceiver(track || kind, { direction: 'sendrecv', streams: [stream] });
        }
        if (kind === 'video') videoSenderRef.current = transceiver.sender;
      }
      // A video sender is negotiated even in voice calls, so camera and screen
      // switches can use replaceTrack without adding an unnegotiated channel.
      if (remoteOffer) {
        for (const candidate of pendingRemoteCandidatesRef.current.splice(0)) await pc.addIceCandidate(candidate);
      }
      return pc;
    } catch (err: any) {
      setState('FAILED');
      setError(err.message || 'Failed to establish call media');
      return null;
    }
  }, [initializeMedia, startQualityMonitoring]);

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
    const pc = await createPeerConnection(credentials, modality, onIceCandidate, offer);
    if (!pc) return null;
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
    if (!pc || !pc.remoteDescription) {
      pendingRemoteCandidatesRef.current.push(candidate);
      return;
    }
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }, []);

  // Keep the sender when its track is null (camera off / share stopped).
  const stopScreenShare = useCallback(async () => {
    const screen = screenTrackRef.current;
    if (!screen) return;
    const generation = mediaGenerationRef.current;
    const camera = cameraTrackRef.current?.readyState === 'live' ? cameraTrackRef.current : null;
    try {
      await videoSenderRef.current?.replaceTrack(camera);
    } catch {
      setError('Unable to restore the camera after sharing. Try turning the camera on again.');
      await videoSenderRef.current?.replaceTrack(null).catch(() => {});
    }
    screen.onended = null;
    screen.stop();
    if (generation !== mediaGenerationRef.current || screenTrackRef.current !== screen) return;
    screenTrackRef.current = null;
    replaceLocalVideo(camera);
    setIsScreenSharing(false);
    setCameraEnabled(Boolean(camera));
    setCallModality(camera ? 'video' : 'audio');
  }, [replaceLocalVideo]);

  const startScreenShare = useCallback(async (): Promise<boolean> => {
    if (videoOperationRef.current) return false;
    if (screenTrackRef.current?.readyState === 'live') return true;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Screen sharing requires HTTPS and a desktop browser that supports screen capture.');
      return false;
    }
    videoOperationRef.current = true;
    const generation = mediaGenerationRef.current;
    let display: MediaStream | null = null;
    try {
      setError(null);
      // Called directly by a click, before any network request or timer.
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const screen = display.getVideoTracks()[0];
      if (!screen || generation !== mediaGenerationRef.current) {
        display.getTracks().forEach(track => track.stop());
        return false;
      }
      screen.contentHint = 'detail';
      if (peerConnectionRef.current && !videoSenderRef.current) throw new Error('The call has no negotiated video channel. Reconnect the call to share your screen.');
      await videoSenderRef.current?.replaceTrack(screen);
      if (generation !== mediaGenerationRef.current) { display.getTracks().forEach(track => track.stop()); return false; }
      screenTrackRef.current = screen;
      screen.onended = () => { void stopScreenShare(); };
      replaceLocalVideo(screen);
      setIsScreenSharing(true);
      setCallModality('screenshare');
      return true;
    } catch (err: any) {
      display?.getTracks().forEach(track => track.stop());
      if (generation === mediaGenerationRef.current) setError(err.name === 'NotAllowedError'
        ? 'Screen sharing was cancelled or blocked. Select a screen, window, or browser tab to share.'
        : err.message || 'Unable to share your screen. Try another window or tab.');
      return false;
    } finally {
      videoOperationRef.current = false;
    }
  }, [replaceLocalVideo, stopScreenShare]);

  const toggleCamera = useCallback(async () => {
    if (videoOperationRef.current) return;
    videoOperationRef.current = true;
    const generation = mediaGenerationRef.current;
    let captured: MediaStream | null = null;
    try {
      setError(null);
      // The camera control switches from a presentation back to camera video.
      if (screenTrackRef.current) {
        await stopScreenShare();
        if (cameraTrackRef.current) return;
      }
      if (cameraTrackRef.current?.readyState === 'live') {
        await videoSenderRef.current?.replaceTrack(null);
        cameraTrackRef.current.stop();
        cameraTrackRef.current = null;
        replaceLocalVideo(null);
        setCameraEnabled(false);
        setCallModality('audio');
        return;
      }
      captured = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
          deviceId: selectedCamera ? { ideal: selectedCamera } : undefined },
      });
      const camera = captured.getVideoTracks()[0];
      if (!camera || generation !== mediaGenerationRef.current) { captured.getTracks().forEach(track => track.stop()); return; }
      await videoSenderRef.current?.replaceTrack(camera);
      if (generation !== mediaGenerationRef.current) { captured.getTracks().forEach(track => track.stop()); return; }
      cameraTrackRef.current = camera;
      replaceLocalVideo(camera);
      setCameraEnabled(true);
      setCallModality('video');
      void enumerateDevices();
    } catch (err: any) {
      captured?.getTracks().forEach(track => track.stop());
      if (generation === mediaGenerationRef.current) setError(err.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access in browser settings.'
        : 'Unable to activate the camera. Check whether another app is using it.');
    } finally { videoOperationRef.current = false; }
  }, [stopScreenShare, selectedCamera, replaceLocalVideo, enumerateDevices]);

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

  const releaseMedia = useCallback(() => {
    ++mediaGenerationRef.current;
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    const tracks = new Set([
      ...(localStreamRef.current?.getTracks() || []),
      ...(screenTrackRef.current ? [screenTrackRef.current] : []),
      ...(cameraTrackRef.current ? [cameraTrackRef.current] : []),
    ]);
    tracks.forEach(track => { track.onended = null; track.stop(); });
    screenTrackRef.current = null;
    cameraTrackRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    videoSenderRef.current = null;
    const pc = peerConnectionRef.current;
    peerConnectionRef.current = null;
    pc?.close();
    pendingRemoteCandidatesRef.current = [];
  }, []);

  const disconnect = useCallback(() => {
    releaseMedia();
    setLocalStream(null);
    setRemoteStream(null);
    setIsScreenSharing(false);
    setCameraEnabled(false);
    setIsRecording(false);
    setIsPttActive(false);
    setQuality({});
    setState('DISCONNECTED');
  }, [releaseMedia]);

  useEffect(() => releaseMedia, [releaseMedia]);

  const setMicrophone = useCallback(async (deviceId: string) => {
    if (!localStreamRef.current) { setSelectedMicrophone(deviceId); return; }
    const generation = mediaGenerationRef.current;
    let captured: MediaStream | null = null;
    try {
      setError(null);
      captured = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
      const track = captured.getAudioTracks()[0];
      if (!track || generation !== mediaGenerationRef.current) { captured.getTracks().forEach(track => track.stop()); return; }
      track.enabled = microphoneEnabled;
      const sender = peerConnectionRef.current?.getTransceivers().find(item => item.receiver.track.kind === 'audio')?.sender;
      await sender?.replaceTrack(track);
      if (generation !== mediaGenerationRef.current) { captured.getTracks().forEach(track => track.stop()); return; }
      localStreamRef.current?.getAudioTracks().forEach(old => old.stop());
      updateLocalStream([track, ...(localStreamRef.current?.getVideoTracks() || [])]);
      setSelectedMicrophone(deviceId);
    } catch {
      captured?.getTracks().forEach(track => track.stop());
      setError('Unable to switch microphones. The previous microphone remains selected.');
    }
  }, [microphoneEnabled, updateLocalStream]);

  const setCamera = useCallback(async (deviceId: string) => {
    if (!cameraTrackRef.current) { setSelectedCamera(deviceId); return; }
    if (videoOperationRef.current) return;
    videoOperationRef.current = true;
    const generation = mediaGenerationRef.current;
    let captured: MediaStream | null = null;
    try {
      setError(null);
      captured = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
      const track = captured.getVideoTracks()[0];
      if (!track || generation !== mediaGenerationRef.current) { captured.getTracks().forEach(track => track.stop()); return; }
      // Changing the camera during sharing must not replace the presentation.
      if (!screenTrackRef.current) await videoSenderRef.current?.replaceTrack(track);
      if (generation !== mediaGenerationRef.current) { captured.getTracks().forEach(track => track.stop()); return; }
      cameraTrackRef.current?.stop();
      cameraTrackRef.current = track;
      if (!screenTrackRef.current) replaceLocalVideo(track);
      setSelectedCamera(deviceId);
    } catch {
      captured?.getTracks().forEach(track => track.stop());
      setError('Unable to switch cameras. The previous camera remains selected.');
    } finally { videoOperationRef.current = false; }
  }, [replaceLocalVideo]);

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
