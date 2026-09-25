/**
 * KryptoVision Connect - WebRTC Audio Hook
 * 
 * Manages WebRTC peer connection for voice calls:
 * - Microphone access
 * - Peer connection setup with TURN
 * - Audio stream management
 * - Connection quality monitoring
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebRTCCredentials } from '@/services/communication-api';

// ============================================================================
// TYPES
// ============================================================================

export type WebRTCState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'FAILED';

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export interface QualityMetrics {
  rtt?: number;
  jitter?: number;
  packetLoss?: number;
  audioLevel?: number;
}

export interface WebRTCAudioHook {
  state: WebRTCState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
  
  availableMicrophones: AudioDeviceInfo[];
  availableSpeakers: AudioDeviceInfo[];
  selectedMicrophone: string | null;
  selectedSpeaker: string | null;
  
  quality: QualityMetrics;
  
  // Actions
  requestMicrophonePermission: () => Promise<boolean>;
  connect: (credentials: WebRTCCredentials, remoteParticipantId: string) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
  setMicrophone: (deviceId: string) => Promise<void>;
  setSpeaker: (deviceId: string) => Promise<void>;
  
  // Errors
  error: string | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWebRTCAudio(): WebRTCAudioHook {
  const [state, setState] = useState<WebRTCState>('IDLE');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [availableMicrophones, setAvailableMicrophones] = useState<AudioDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<AudioDeviceInfo[]>([]);
  const [selectedMicrophone, setSelectedMicrophone] = useState<string | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [quality, setQuality] = useState<QualityMetrics>({});
  const [error, setError] = useState<string | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  
  // Request microphone permission
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      
      setLocalStream(stream);
      
      // Enumerate devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`, kind: 'audioinput' as const }));
      const speakers = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`, kind: 'audiooutput' as const }));
      
      setAvailableMicrophones(mics);
      setAvailableSpeakers(speakers);
      
      // Set default devices
      if (mics.length > 0) {
        setSelectedMicrophone(mics[0].deviceId);
      }
      if (speakers.length > 0) {
        setSelectedSpeaker(speakers[0].deviceId);
      }
      
      return true;
    } catch (err: any) {
      console.error('[WebRTC] Microphone permission error:', err);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission denied. Please allow microphone access and try again.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else {
        setError('Failed to access microphone. Please check your device settings.');
      }
      
      return false;
    }
  }, []);
  
  // Connect to remote peer
  const connect = useCallback(async (credentials: WebRTCCredentials, remoteParticipantId: string) => {
    try {
      setState('CONNECTING');
      setError(null);
      
      // Ensure we have local stream
      if (!localStream) {
        const permissionGranted = await requestMicrophonePermission();
        if (!permissionGranted) {
          setState('FAILED');
          return;
        }
      }
      
      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: credentials.iceServers,
      });
      
      peerConnectionRef.current = pc;
      
      // Add local stream
      if (localStream) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
      }
      
      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('[WebRTC] Received remote track:', event.track.kind);
        setRemoteStream(event.streams[0]);
      };
      
      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
        
        switch (pc.connectionState) {
          case 'connecting':
            setState('CONNECTING');
            break;
          case 'connected':
            setState('CONNECTED');
            break;
          case 'disconnected':
            setState('RECONNECTING');
            break;
          case 'failed':
            setState('FAILED');
            setError('Connection failed. Please check your network connection.');
            break;
          case 'closed':
            setState('DISCONNECTED');
            break;
        }
      };
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[WebRTC] ICE candidate:', event.candidate.type);
        }
      };
      
      // Create offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      
      await pc.setLocalDescription(offer);
      
      // In a real implementation, you would send the offer to the remote peer
      // via your signaling server and receive their answer
      // For now, we're establishing the connection in a simplified way
      
      console.log('[WebRTC] Connection initiated');
      
      // Start quality monitoring
      startQualityMonitoring();
      
    } catch (err: any) {
      console.error('[WebRTC] Connection error:', err);
      setState('FAILED');
      setError('Failed to establish connection. Please try again.');
    }
  }, [localStream, requestMicrophonePermission]);
  
  // Disconnect
  const disconnect = useCallback(() => {
    console.log('[WebRTC] Disconnecting');
    
    // Stop quality monitoring
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    // Clear remote stream
    setRemoteStream(null);
    
    setState('DISCONNECTED');
  }, [localStream]);
  
  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setMicrophoneEnabled(audioTracks[0]?.enabled ?? false);
    }
  }, [localStream]);
  
  // Set microphone device
  const setMicrophone = useCallback(async (deviceId: string) => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      
      // Stop old stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      setLocalStream(newStream);
      setSelectedMicrophone(deviceId);
      
      // Update peer connection if active
      if (peerConnectionRef.current && state === 'CONNECTED') {
        const pc = peerConnectionRef.current;
        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track?.kind === 'audio');
        
        if (audioSender) {
          const newTrack = newStream.getAudioTracks()[0];
          await audioSender.replaceTrack(newTrack);
        }
      }
    } catch (err) {
      console.error('[WebRTC] Failed to set microphone:', err);
      setError('Failed to switch microphone device.');
    }
  }, [localStream, state]);
  
  // Set speaker device
  const setSpeaker = useCallback(async (deviceId: string) => {
    try {
      // Note: Setting audio output device requires HTMLMediaElement
      // This should be done on the actual <audio> element playing the remote stream
      setSelectedSpeaker(deviceId);
    } catch (err) {
      console.error('[WebRTC] Failed to set speaker:', err);
      setError('Failed to switch speaker device.');
    }
  }, []);
  
  // Quality monitoring
  const startQualityMonitoring = useCallback(() => {
    if (!peerConnectionRef.current) return;
    
    const pc = peerConnectionRef.current;
    
    statsIntervalRef.current = window.setInterval(async () => {
      try {
        const stats = await pc.getStats();
        
        let rtt: number | undefined;
        let jitter: number | undefined;
        let packetLoss: number | undefined;
        
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : undefined;
          }
          
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            jitter = report.jitter ? report.jitter * 1000 : undefined;
            
            if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
              const total = report.packetsLost + report.packetsReceived;
              packetLoss = total > 0 ? (report.packetsLost / total) * 100 : 0;
            }
          }
        });
        
        setQuality({ rtt, jitter, packetLoss });
      } catch (err) {
        console.error('[WebRTC] Stats error:', err);
      }
    }, 2000);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  return {
    state,
    localStream,
    remoteStream,
    microphoneEnabled,
    speakerEnabled,
    availableMicrophones,
    availableSpeakers,
    selectedMicrophone,
    selectedSpeaker,
    quality,
    requestMicrophonePermission,
    connect,
    disconnect,
    toggleMute,
    setMicrophone,
    setSpeaker,
    error,
  };
}
