/**
 * Web Audio Tone Synthesizer
 * 
 * Generates clean, responsive multi-frequency alert sound patterns in-memory
 * without requiring external MP3 asset downloads.
 */

export class AlertAudioSynthesizer {
  private audioContext?: AudioContext | undefined;
  private masterGain?: GainNode | undefined;

  /**
   * Initializes or resumes the AudioContext with user interaction
   */
  async ensureAudioContext(): Promise<AudioContext> {
    if (typeof window === "undefined") {
      throw new Error("AudioContext is only available in browser environments");
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser");
    }

    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContextClass();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.setValueAtTime(0.9, this.audioContext.currentTime);
      this.masterGain.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  getContext(): AudioContext | undefined {
    return this.audioContext;
  }

  setMasterVolume(volume: number) {
    if (this.masterGain && this.audioContext) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.masterGain.gain.setValueAtTime(clamped, this.audioContext.currentTime);
    }
  }

  /**
   * Plays a sequence of frequencies with envelope shaping
   */
  async playToneSequence(frequencies: number[], volumeMultiplier = 1.0): Promise<void> {
    if (frequencies.length === 0) return;
    const ctx = await this.ensureAudioContext();

    const now = ctx.currentTime;
    const toneDuration = 0.18;
    const gap = 0.04;

    frequencies.forEach((freq, index) => {
      const startTime = now + index * (toneDuration + gap);
      const stopTime = startTime + toneDuration;

      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      // Envelope: Fast attack, sustain, exponential decay
      const peakGain = 0.15 * Math.max(0.1, volumeMultiplier);
      toneGain.gain.setValueAtTime(0.0001, startTime);
      toneGain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.02);
      toneGain.gain.setValueAtTime(peakGain, startTime + toneDuration - 0.04);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

      osc.connect(toneGain);
      if (this.masterGain) {
        toneGain.connect(this.masterGain);
      } else {
        toneGain.connect(ctx.destination);
      }

      osc.start(startTime);
      osc.stop(stopTime + 0.02);
    });
  }

  /**
   * Plays a short pleasant unlock tone when operator enables audio
   */
  async playUnlockTone(): Promise<void> {
    await this.playToneSequence([523, 659, 784, 1046], 0.7); // C5 - E5 - G5 - C6 arpeggio
  }
}

export const alertAudioSynthesizer = new AlertAudioSynthesizer();
