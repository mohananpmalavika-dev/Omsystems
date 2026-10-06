import { useCallback, useEffect, useRef, useState } from 'react';

// Calls have their own sound preference; the workspace alert mute is unrelated.
export function useCallRingtone(callId: string | undefined) {
  const contextRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  const enableSound = useCallback(() => {
    setEnabled(true);
    localStorage.setItem('commRingtoneEnabled', 'true');
    try {
      const context = contextRef.current || new AudioContext();
      contextRef.current = context;
      void context.resume().then(() => setReady(context.state === 'running')).catch(() => setReady(false));
    } catch { setReady(false); }
  }, []);

  useEffect(() => {
    setEnabled(localStorage.getItem('commRingtoneEnabled') !== 'false');
    const unlock = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-comm-ringtone-control]')) return;
      if (localStorage.getItem('commRingtoneEnabled') !== 'false') enableSound();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== 'closed') void context.close();
    };
  }, [enableSound]);

  useEffect(() => {
    if (!callId || !enabled || !ready) return;
    const context = contextRef.current;
    if (!context || context.state !== 'running') { setReady(false); return; }
    const tones = new Set<OscillatorNode>();
    const gains = new Set<GainNode>();
    const ring = () => {
      if (context.state !== 'running') { setReady(false); return; }
      // A soft two-pulse telephone cadence, generated locally with no asset fetch.
      for (const delay of [0, 0.65]) {
        const gain = context.createGain();
        gains.add(gain);
        let remaining = 2;
        const start = context.currentTime + delay;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.09, start + 0.03);
        gain.gain.setValueAtTime(0.09, start + 0.4);
        gain.gain.linearRampToValueAtTime(0, start + 0.46);
        gain.connect(context.destination);
        for (const frequency of [440, 480]) {
          const tone = context.createOscillator();
          tone.frequency.value = frequency;
          tone.connect(gain);
          tones.add(tone);
          tone.onended = () => {
            tones.delete(tone); tone.disconnect();
            if (--remaining === 0) { gain.disconnect(); gains.delete(gain); }
          };
          tone.start(start);
          tone.stop(start + 0.48);
        }
      }
    };
    ring();
    const timer = window.setInterval(ring, 3000);
    return () => {
      window.clearInterval(timer);
      for (const tone of tones) { tone.onended = null; tone.stop(); tone.disconnect(); }
      tones.clear();
      for (const gain of gains) gain.disconnect();
      gains.clear();
    };
  }, [callId, enabled, ready]);

  const toggleSound = useCallback(() => {
    if (!enabled || !ready) { enableSound(); return; }
    localStorage.setItem('commRingtoneEnabled', 'false');
    setEnabled(false);
  }, [enabled, ready, enableSound]);

  return { enabled, ready, enableSound, toggleSound };
}
