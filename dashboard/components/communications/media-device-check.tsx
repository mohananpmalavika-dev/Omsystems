"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, Mic, Settings2, X } from 'lucide-react';
import { StreamVideo } from './call-workspace';
import styles from './communications.module.css';

export function MediaDeviceCheck({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [micLabel, setMicLabel] = useState('Microphone not tested');
  const [micHeard, setMicHeard] = useState(false);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState<'camera' | 'microphone' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const animation = useRef<number | null>(null);
  const generation = useRef(0);
  const testing = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const release = useCallback(() => {
    ++generation.current;
    streams.current.forEach(stream => stream.getTracks().forEach(track => track.stop()));
    streams.current = [];
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    void audioContext.current?.close().catch(() => {});
    audioContext.current = null;
  }, []);
  const close = useCallback(() => {
    release(); setOpen(false); setCameraStream(null); setCameraReady(false);
    setMicLabel('Microphone not tested'); setMicHeard(false); setLevel(0); setError(null); setBusy(null);
    triggerRef.current?.focus();
  }, [release]);
  useEffect(() => release, [release]);
  useEffect(() => { if (disabled) close(); }, [disabled, close]);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab' && dialog) {
        const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [open, close]);

  const test = async (kind: 'camera' | 'microphone') => {
    if (testing.current) return;
    testing.current = true;
    setBusy(kind); setError(null);
    const current = generation.current;
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use HTTPS or localhost to access camera and microphone.');
      stream = await navigator.mediaDevices.getUserMedia(kind === 'camera'
        ? { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
        : { audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (current !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const previous = streams.current.filter(item => kind === 'camera' ? item.getVideoTracks().length : item.getAudioTracks().length);
      previous.forEach(item => item.getTracks().forEach(track => track.stop()));
      streams.current = [...streams.current.filter(item => !previous.includes(item)), stream];
      if (kind === 'camera') { setCameraReady(false); setCameraStream(stream); }
      else {
        if (animation.current !== null) cancelAnimationFrame(animation.current);
        await audioContext.current?.close();
        const context = new AudioContext();
        audioContext.current = context;
        await context.resume();
        if (current !== generation.current) { void context.close(); return; }
        setMicLabel(stream.getAudioTracks()[0]?.label || 'Microphone'); setMicHeard(false);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (current !== generation.current) return;
          analyser.getByteTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
          setLevel(Math.min(100, Math.round(rms * 300)));
          if (rms > .015) setMicHeard(true);
          animation.current = requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (cause) {
      if (current !== generation.current) return;
      const name = cause instanceof Error ? cause.name : '';
      setError(name === 'NotAllowedError' ? 'Permission denied. Allow this site to use your camera or microphone in browser settings.'
        : name === 'NotFoundError' ? 'Device not found. Connect a camera or microphone and try again.'
        : name === 'NotReadableError' ? 'Device is busy. Close other apps using the camera or microphone.'
        : cause instanceof Error ? cause.message : 'Unable to check this device.');
    } finally {
      testing.current = false;
      if (current === generation.current) setBusy(null);
    }
  };

  return <>
    <button ref={triggerRef} type="button" disabled={disabled} className={styles.checkButton} onClick={() => setOpen(true)}><Settings2 size={15} /> Device check</button>
    {open && <div className={styles.checkOverlay} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} tabIndex={-1} className={styles.checkDialog} role="dialog" aria-modal="true" aria-labelledby="media-check-title">
        <div className={styles.checkHeading}><h2 id="media-check-title">Camera & microphone check</h2><button type="button" aria-label="Close device check" onClick={close}><X size={19} /></button></div>
        <p className={styles.checkDescription}>Check your preview and speak into the microphone before joining a call.</p>
        <div className={styles.checkPreview}><StreamVideo stream={cameraStream} label="Camera test preview" mirror onReady={setCameraReady} />
          {!cameraStream && <div className={styles.checkPlaceholder}><Camera size={36} /></div>}
        </div>
        <div className={styles.checkResults} aria-live="polite">
          <div className={styles.checkResult}>{cameraReady ? <CheckCircle2 size={16} color="#83d9bd" /> : <Camera size={16} />}<span>{cameraStream?.getVideoTracks()[0]?.label || 'Camera not tested'}</span><small>{cameraReady ? 'Video frames received' : cameraStream ? 'Waiting for video frames' : 'Not checked'}</small></div>
          <div className={styles.checkResult}>{micHeard ? <CheckCircle2 size={16} color="#83d9bd" /> : <Mic size={16} />}<span>{micLabel}</span><small>{micHeard ? 'Audio detected' : audioContext.current ? 'Speak to test' : 'Not checked'}</small></div>
          <div className={styles.micMeter} role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}><span style={{ width: `${level}%` }} /></div>
        </div>
        {error && <p role="alert" className={styles.checkError}>{error}</p>}
        <div className={styles.checkActions}>
          <button type="button" disabled={Boolean(busy)} onClick={() => void test('camera')}>{busy === 'camera' ? <Loader2 size={16} className={styles.spin} /> : <Camera size={16} />} Test camera</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void test('microphone')}>{busy === 'microphone' ? <Loader2 size={16} className={styles.spin} /> : <Mic size={16} />} Test microphone</button>
        </div>
        <p className={styles.checkFootnote}>This preview stays on your device. Closing this window stops the test camera and microphone.</p>
      </div>
    </div>}
  </>;
}
