"use client";

import { useEffect, useRef, useState, type RefObject } from 'react';
import { AlertCircle, Camera, Headphones, Loader2, Maximize2, Mic, MicOff, MonitorUp, Phone, PhoneOff, Settings2, ShieldCheck, Video, VideoOff, Volume2 } from 'lucide-react';
import type { UseWebRTCCallReturn } from '@/hooks/use-webrtc-call';
import styles from './communications.module.css';

export function StreamVideo({ stream, label, mirror = false, onReady, videoRef }: {
  stream: MediaStream | null;
  label: string;
  mirror?: boolean;
  onReady?: (ready: boolean) => void;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    onReady?.(false);
    video.srcObject = stream;
    const ready = () => onReady?.(video.videoWidth > 0 && Boolean(stream?.getVideoTracks().some(track => track.readyState === 'live' && !track.muted)));
    video.addEventListener('loadeddata', ready);
    video.addEventListener('playing', ready);
    if (stream) void video.play().then(ready).catch(() => onReady?.(false));
    return () => {
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('playing', ready);
      video.srcObject = null;
    };
  }, [stream, onReady]);
  return <video ref={element => { ref.current = element; if (videoRef) videoRef.current = element; }}
    aria-label={label} autoPlay playsInline muted className={mirror ? styles.mirrored : ''} />;
}

export function CallWorkspace({ media, peerName, status, duration, onEnd, remoteVideoRef }: {
  media: UseWebRTCCallReturn;
  peerName: string;
  status: string;
  duration: string;
  onEnd: () => void;
  remoteVideoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const [remoteReady, setRemoteReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [outputError, setOutputError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const connected = media.state === 'CONNECTED';
  const accepted = status === 'CONNECTED' || connected;
  const callStatus = media.state === 'FAILED' ? 'Media connection failed'
    : media.state === 'RECONNECTING' ? 'Reconnecting'
    : connected ? 'Connected' : accepted ? 'Connecting media' : status === 'RINGING' ? 'Calling' : 'Connecting';
  const hasLocalVideo = Boolean(media.localStream?.getVideoTracks().some(track => track.readyState === 'live'));
  const initials = peerName.split(' ').filter(Boolean).slice(0, 2).map(name => name[0]).join('').toUpperCase();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = media.remoteStream;
    if (media.remoteStream) void audio.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    return () => { audio.srcObject = null; };
  }, [media.remoteStream]);

  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    setOutputError(null);
    if (audio?.setSinkId && media.selectedSpeaker) {
      void audio.setSinkId(media.selectedSpeaker).catch(() => setOutputError('Unable to use that speaker. Browser default audio output is active.'));
    }
  }, [media.selectedSpeaker]);

  const changeVideo = async (action: () => Promise<unknown>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try { await action(); } finally { setActionBusy(false); }
  };

  return <section className={styles.callWorkspace} aria-label="Active call">
    <header className={styles.callHeader}>
      <div className={styles.peerIdentity}><div className={styles.peerIcon}><Phone size={19} /></div>
        <div><span className={styles.eyebrow}>KRYPTO COMMUNICATIONS</span><h2>{peerName}</h2></div>
      </div>
      <div className={styles.sessionStatus}><span className={`${styles.statusDot} ${connected ? styles.connected : ''}`} />
        <span role="status">{callStatus}</span><time>{duration}</time>
      </div>
    </header>

    <div className={styles.videoStage} ref={stageRef}>
      <StreamVideo stream={media.remoteStream} label="Remote participant video" onReady={setRemoteReady} videoRef={remoteVideoRef} />
      {!remoteReady && <div className={styles.participantPlaceholder}>
        <div className={styles.avatar}>{initials || 'KV'}</div><h3>{peerName}</h3>
        <p>{connected ? 'Camera is off · audio call is active' : callStatus === 'Calling' ? 'Waiting for an answer…' : callStatus}</p>
        {!connected && media.state !== 'FAILED' && <Loader2 size={18} className={styles.spin} />}
      </div>}
      <div className={styles.stageTopline}><span><ShieldCheck size={13} /> Call workspace</span>
        <button type="button" aria-label="Expand call video" onClick={() => void stageRef.current?.requestFullscreen?.().catch(() => {})}><Maximize2 size={15} /></button>
      </div>
      <div className={styles.stagePeer}><span className={`${styles.statusDot} ${connected ? styles.connected : ''}`} />{peerName}</div>
      <div className={`${styles.localPreview} ${media.isScreenSharing ? styles.screenPreview : ''}`}>
        <StreamVideo stream={media.localStream} label="Your local video preview" mirror={!media.isScreenSharing} />
        {!hasLocalVideo && <div className={styles.localPlaceholder}><VideoOff size={23} /><span>Camera off</span></div>}
        <span className={styles.previewLabel}>{media.isScreenSharing ? <MonitorUp size={12} /> : <Camera size={12} />}{media.isScreenSharing ? 'Your screen' : 'You'}</span>
      </div>
    </div>

    {media.isScreenSharing && <div className={styles.shareNotice}><MonitorUp size={15} /><span>Your screen is being shared with {peerName}.</span>
      <button type="button" disabled={actionBusy} onClick={() => void changeVideo(media.stopScreenShare)}>Stop sharing</button></div>}
    {(media.error || outputError) && <div className={styles.error} role="alert"><AlertCircle size={16} />{media.error || outputError}</div>}
    {audioBlocked && <button type="button" className={styles.audioPrompt} onClick={() => void audioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))}>
      <Volume2 size={16} /> Play call audio</button>}

    <footer className={styles.callFooter}>
      <div className={styles.connectionInfo}><span className={`${styles.statusDot} ${connected ? styles.connected : ''}`} />
        {connected ? 'Media connected' : 'Establishing media'}
        {connected && media.quality.rtt !== undefined && <span>{media.quality.rtt} ms</span>}
      </div>
      <div className={styles.callControls}>
        <button type="button" className={`${styles.control} ${!media.microphoneEnabled ? styles.controlOff : ''}`} aria-label={media.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={!media.microphoneEnabled} onClick={media.toggleMute}>
          {media.microphoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}<span>{media.microphoneEnabled ? 'Mute' : 'Unmute'}</span></button>
        <button type="button" className={styles.control} disabled={actionBusy} aria-label={media.cameraEnabled && !media.isScreenSharing ? 'Turn camera off' : 'Turn camera on'} aria-pressed={media.cameraEnabled && !media.isScreenSharing} onClick={() => void changeVideo(media.toggleCamera)}>
          {media.cameraEnabled && !media.isScreenSharing ? <Video size={20} /> : <VideoOff size={20} />}<span>Camera</span></button>
        <button type="button" className={`${styles.control} ${media.isScreenSharing ? styles.controlActive : ''}`} disabled={actionBusy || !accepted} aria-pressed={media.isScreenSharing} onClick={() => void changeVideo(media.isScreenSharing ? media.stopScreenShare : media.startScreenShare)}>
          <MonitorUp size={20} /><span>{media.isScreenSharing ? 'Stop share' : 'Share screen'}</span></button>
        <button type="button" className={styles.control} aria-label="Call device settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)}><Settings2 size={20} /><span>Devices</span></button>
        <button type="button" className={styles.endCall} onClick={onEnd}><PhoneOff size={20} /><span>{accepted ? 'End call' : 'Cancel call'}</span></button>
      </div>
      <span className={styles.footerBrand}>KryptoVision</span>
    </footer>
    {settingsOpen && <div className={styles.deviceSettings}>
      <label><Mic size={15} /> Microphone<select aria-label="Call microphone" value={media.selectedMicrophone || ''} onChange={event => void media.setMicrophone(event.target.value)}>
        {!media.availableMicrophones.length && <option value="">System default</option>}{media.availableMicrophones.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
      <label><Camera size={15} /> Camera<select aria-label="Call camera" value={media.selectedCamera || ''} onChange={event => void media.setCamera(event.target.value)}>
        {!media.availableCameras.length && <option value="">System default</option>}{media.availableCameras.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
      <label><Headphones size={15} /> Speaker<select aria-label="Call speaker" value={media.selectedSpeaker || ''} onChange={event => void media.setSpeaker(event.target.value)}>
        {!media.availableSpeakers.length && <option value="">System default</option>}{media.availableSpeakers.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
    </div>}
    <audio ref={audioRef} autoPlay playsInline aria-label="Remote call audio" />
  </section>;
}
