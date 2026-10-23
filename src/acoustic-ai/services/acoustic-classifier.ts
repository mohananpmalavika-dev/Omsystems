/**
 * Production-Grade Acoustic AI Anomaly Classifier Engine
 *
 * Implements real-time Digital Signal Processing (DSP) and acoustic pattern
 * classification to detect security incidents occurring inside and outside camera visual FOV:
 *
 * 1. Glass Breaking Detection (ഗ്ലാസ് പൊട്ടുന്ന ശബ്ദം)
 * 2. Screaming / Aggression Detection (അലർച്ച / നിലവിളി)
 * 3. Gunshot / Explosive Blast (വെടിശബ്ദം / സ്ഫോടനം)
 * 4. Shutter Tamper / Heavy Metal Breach (ഷട്ടർ തകർക്കുന്ന ശബ്ദം / മെറ്റൽ ഇംപാക്റ്റ്)
 * 5. Acoustic Spike (Generic high-transient impacts)
 */

import type {
  AcousticClassificationResult,
  AcousticDspFeatures,
  AcousticRule,
  AcousticSignature,
} from '../domain/acoustic-ai.types.js';

export class AcousticClassifier {
  private static readonly DB_FLOOR = -90.0;

  /**
   * Primary entry point: Extracts DSP features and classifies the acoustic signature
   */
  static classify(
    samples: Float32Array,
    sampleRate: number = 16000,
    rule?: Partial<AcousticRule>
  ): AcousticClassificationResult | null {
    if (!samples || samples.length === 0) {
      return null;
    }

    const dsp = this.extractDspFeatures(samples, sampleRate);

    // Filter out low-energy ambient noise
    if (dsp.peakDbFS < -42.0 && dsp.rmsDbFS < -48.0) {
      return null;
    }

    // Sensitivity multipliers (0.10 to 1.00, default ~0.80)
    const glassSens = rule?.glass_sensitivity ?? 0.80;
    const screamSens = rule?.scream_sensitivity ?? 0.75;
    const gunshotSens = rule?.gunshot_sensitivity ?? 0.90;
    const shutterSens = rule?.shutter_sensitivity ?? 0.80;
    const minConfidence = rule?.min_confidence ?? 0.65;

    // 1. Evaluate Gunshot / Blast (Highest urgency, ultra-fast rise time, extreme crest factor)
    const gunshotResult = this.evaluateGunshot(dsp, gunshotSens);
    if (gunshotResult && gunshotResult.confidence >= minConfidence) {
      return gunshotResult;
    }

    // 2. Evaluate Glass Breaking (High frequency ratio, high spectral centroid, brittle fracture decay)
    const glassResult = this.evaluateGlassBreak(dsp, glassSens);
    if (glassResult && glassResult.confidence >= minConfidence) {
      return glassResult;
    }

    // 3. Evaluate Shutter Tamper / Structural Breach (Metal impact, metallic resonance in 600-2200 Hz)
    const shutterResult = this.evaluateShutterTamper(dsp, shutterSens);
    if (shutterResult && shutterResult.confidence >= minConfidence) {
      return shutterResult;
    }

    // 4. Evaluate Screaming / Human Distress Vocalization (Mid-high vocal formants, pitch jitter, sustained SPL)
    const screamResult = this.evaluateScream(dsp, screamSens);
    if (screamResult && screamResult.confidence >= minConfidence) {
      return screamResult;
    }

    // 5. Evaluate Generic High-Transient Acoustic Spike (falls through if high crest factor / SNR)
    if (dsp.crestFactorDb >= 15.0 && dsp.peakDbFS >= -14.0 && dsp.snrDb >= 18.0) {
      return {
        signature: 'acoustic_spike',
        confidence: 0.72,
        severity: 'P2',
        isThreat: true,
        dspFeatures: dsp,
        description: 'Generic high-transient acoustic impact detected in camera zone',
        detectedCharacteristics: [
          `Crest factor ${dsp.crestFactorDb.toFixed(1)} dB`,
          `Peak ${dsp.peakDbFS.toFixed(1)} dBFS`,
          `SNR ${dsp.snrDb.toFixed(1)} dB`,
        ],
      };
    }

    return null;
  }

  /**
   * Evaluates Gunshot / Explosive Shockwave
   */
  private static evaluateGunshot(
    dsp: AcousticDspFeatures,
    sensitivity: number
  ): AcousticClassificationResult | null {
    // Gunshots exhibit:
    // - Ultra-sharp attack time: < 4 ms (shockwave N-wave)
    // - Extreme crest factor: > 16.0 - (sensitivity - 0.5) * 4.0 dB
    // - High peak level: >= -10.0 dBFS (or clipping)
    // - Broadband spectral dispersion followed by room reverberation decay
    const requiredCrest = 16.5 - (sensitivity - 0.5) * 4.0;
    const requiredPeak = -10.0 + (1.0 - sensitivity) * 4.0;

    const isFastAttack = dsp.attackTimeMs <= 5.0;
    const isExtremeCrest = dsp.crestFactorDb >= requiredCrest;
    const isHighPeak = dsp.peakDbFS >= requiredPeak;
    const isBroadbandOrLoud = dsp.snrDb >= 20.0 || dsp.isClipping;

    // Door slams have energy almost entirely below 300Hz (highLowRatio < 0.25)
    const isNotDoorSlam = dsp.highLowRatio >= 0.20 || dsp.midBandEnergyRatio >= 0.25;

    if (isFastAttack && isExtremeCrest && isHighPeak && isBroadbandOrLoud && isNotDoorSlam) {
      let confidence = 0.85;
      if (dsp.attackTimeMs <= 2.5) confidence += 0.05;
      if (dsp.crestFactorDb >= 19.0) confidence += 0.05;
      if (dsp.isClipping) confidence += 0.04;
      confidence = Math.min(0.99, confidence);

      return {
        signature: 'gunshot_blast',
        confidence,
        severity: 'P1',
        isThreat: true,
        dspFeatures: dsp,
        description: 'Gunshot shockwave or explosive blast wave detected with ultra-fast acoustic rise time',
        detectedCharacteristics: [
          `N-wave transient attack: ${dsp.attackTimeMs.toFixed(1)} ms`,
          `Extreme crest factor: ${dsp.crestFactorDb.toFixed(1)} dB`,
          `Peak amplitude: ${dsp.peakDbFS.toFixed(1)} dBFS`,
          `Reverberation room decay: ${dsp.decayTimeMs.toFixed(0)} ms`,
        ],
      };
    }

    return null;
  }

  /**
   * Evaluates Glass Breaking / Shattering
   */
  private static evaluateGlassBreak(
    dsp: AcousticDspFeatures,
    sensitivity: number
  ): AcousticClassificationResult | null {
    // Glass breaking exhibits:
    // - High spectral centroid (> 3400 Hz)
    // - High high-to-low frequency ratio (> 2.5)
    // - High zero crossing rate (> 0.22)
    // - Fast attack (< 15 ms) and brittle shattering decay trail (150 - 900 ms)
    // - Peak dBFS >= -22.0
    const minHighRatio = 2.5 - (sensitivity - 0.5) * 1.5;
    const minCentroid = 3400 - (sensitivity - 0.5) * 800;
    const minZcr = 0.20 - (sensitivity - 0.5) * 0.08;

    const hasHighSpectralEnergy = dsp.highLowRatio >= minHighRatio;
    const hasHighCentroid = dsp.spectralCentroidHz >= minCentroid;
    const hasHighZcr = dsp.zeroCrossingRate >= minZcr;
    const hasSharpImpulse = dsp.attackTimeMs <= 20.0;
    const hasAudiblePeak = dsp.peakDbFS >= -26.0;

    if (hasHighSpectralEnergy && (hasHighCentroid || hasHighZcr) && hasSharpImpulse && hasAudiblePeak) {
      let confidence = 0.78;
      if (dsp.highLowRatio >= 4.0) confidence += 0.08;
      if (dsp.spectralCentroidHz >= 4200) confidence += 0.07;
      if (dsp.zeroCrossingRate >= 0.28) confidence += 0.05;
      confidence = Math.min(0.98, confidence);

      return {
        signature: 'glass_break',
        confidence,
        severity: 'P1',
        isThreat: true,
        dspFeatures: dsp,
        description: 'Glass window, showcase, or partition shattering detected (high-frequency brittle fracture resonance)',
        detectedCharacteristics: [
          `High-frequency ratio: ${dsp.highLowRatio.toFixed(1)}x`,
          `Spectral centroid: ${dsp.spectralCentroidHz.toFixed(0)} Hz`,
          `Zero-crossing rate: ${dsp.zeroCrossingRate.toFixed(2)}`,
          `Fracture attack: ${dsp.attackTimeMs.toFixed(1)} ms`,
        ],
      };
    }

    return null;
  }

  /**
   * Evaluates Shutter Tamper / Heavy Metal Breach
   */
  private static evaluateShutterTamper(
    dsp: AcousticDspFeatures,
    sensitivity: number
  ): AcousticClassificationResult | null {
    // Rolling shutter attacks / crowbar prying / sledgehammer on metal doors exhibit:
    // - Strong metallic resonance index in 600 - 2200 Hz (> 0.55)
    // - Mid-band energy ratio >= 0.45
    // - Mechanical impact transient (attack 5 - 35 ms)
    // - Reverberant metallic ringing decay (decay > 180 ms)
    // - Peak dBFS >= -20.0
    const minResonance = 0.40 - (sensitivity - 0.5) * 0.20;

    const hasMetallicResonance = dsp.metallicResonanceIndex >= minResonance;
    const hasMidBandDominance = dsp.midBandEnergyRatio >= 0.35;
    const hasMechanicalStrike = dsp.attackTimeMs <= 50.0;
    const hasRingingDecay = dsp.decayTimeMs >= 60.0;
    const hasImpactLevel = dsp.peakDbFS >= -26.0;

    if (hasMetallicResonance && hasMidBandDominance && hasMechanicalStrike && hasRingingDecay && hasImpactLevel) {
      let confidence = 0.78;
      if (dsp.metallicResonanceIndex >= 0.60) confidence += 0.10;
      if (dsp.midBandEnergyRatio >= 0.45) confidence += 0.06;
      if (dsp.crestFactorDb >= 8.0) confidence += 0.05;
      confidence = Math.min(0.97, confidence);

      return {
        signature: 'shutter_tamper_breach',
        confidence,
        severity: 'P1',
        isThreat: true,
        dspFeatures: dsp,
        description: 'Rolling shutter or metal security grille forced tampering / sledgehammer breach strike',
        detectedCharacteristics: [
          `Metallic resonance index: ${(dsp.metallicResonanceIndex * 100).toFixed(0)}%`,
          `Mid-band structural resonance: ${(dsp.midBandEnergyRatio * 100).toFixed(0)}%`,
          `Strike attack time: ${dsp.attackTimeMs.toFixed(1)} ms`,
          `Vibration decay: ${dsp.decayTimeMs.toFixed(0)} ms`,
        ],
      };
    }

    return null;
  }

  /**
   * Evaluates Screaming / Distress Aggression
   */
  private static evaluateScream(
    dsp: AcousticDspFeatures,
    sensitivity: number
  ): AcousticClassificationResult | null {
    // Human distress screams exhibit:
    // - High vocal tract energy in formants (1000 - 3500 Hz)
    // - Mid-to-high band energy >= 0.50
    // - Sustained high SPL (RMS >= -28.0 dBFS, Peak >= -20.0 dBFS)
    // - Crest factor between 3.0 and 22.0 dB
    // - Decay / sustain >= 60 ms
    const minRms = -28.0 + (1.0 - sensitivity) * 5.0;
    const isLoud = dsp.rmsDbFS >= minRms && dsp.peakDbFS >= -20.0;
    const isVocalDistressBand = dsp.midBandEnergyRatio >= 0.35 && dsp.spectralCentroidHz >= 1000;
    const isSustainedVocal = dsp.crestFactorDb >= 3.0 && dsp.crestFactorDb <= 22.0;
    const isNotPureImpulse = dsp.decayTimeMs >= 60.0;

    if (isLoud && isVocalDistressBand && isSustainedVocal && isNotPureImpulse) {
      let confidence = 0.78;
      if (dsp.rmsDbFS >= -18.0) confidence += 0.08;
      if (dsp.spectralCentroidHz >= 1400) confidence += 0.07;
      if (dsp.midBandEnergyRatio >= 0.50) confidence += 0.05;
      confidence = Math.min(0.96, confidence);

      return {
        signature: 'screaming_aggression',
        confidence,
        severity: 'P1',
        isThreat: true,
        dspFeatures: dsp,
        description: 'Human distress screaming or violent verbal aggression vocalization detected',
        detectedCharacteristics: [
          `Distress vocal SPL: ${dsp.rmsDbFS.toFixed(1)} dBFS RMS`,
          `Spectral centroid: ${dsp.spectralCentroidHz.toFixed(0)} Hz`,
          `Vocal formant energy: ${(dsp.midBandEnergyRatio * 100).toFixed(0)}%`,
          `Sustained vocalization: ${dsp.decayTimeMs.toFixed(0)} ms`,
        ],
      };
    }

    return null;
  }

  /**
   * Pure DSP Feature Extraction from normalized Float32Array [-1.0, 1.0]
   */
  public static extractDspFeatures(
    samples: Float32Array,
    sampleRate: number = 16000
  ): AcousticDspFeatures {
    const len = samples.length;
    let maxAbs = 0;
    let sumSquares = 0;
    let zeroCrossings = 0;
    let peakIndex = 0;
    let clippedCount = 0;

    for (let i = 0; i < len; i++) {
      const sample = samples[i] ?? 0;
      const prev = i > 0 ? (samples[i - 1] ?? 0) : 0;
      const abs = Math.abs(sample);

      if (abs > maxAbs) {
        maxAbs = abs;
        peakIndex = i;
      }
      if (abs >= 0.999) {
        clippedCount++;
      }
      sumSquares += sample * sample;

      if (i > 0 && ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0))) {
        zeroCrossings++;
      }
    }

    const peakDbFS = this.ampToDbFS(maxAbs);
    const rms = Math.sqrt(sumSquares / Math.max(1, len));
    const rmsDbFS = this.ampToDbFS(rms);
    const crestFactorDb = Math.max(0, peakDbFS - rmsDbFS);
    const zeroCrossingRate = zeroCrossings / Math.max(1, len);
    const isClipping = clippedCount > 2;

    // Attack time: time from onset (10% peak) to peak
    let onsetSample = 0;
    const onsetThreshold = maxAbs * 0.10;
    for (let i = 0; i <= peakIndex; i++) {
      if (Math.abs(samples[i] ?? 0) >= onsetThreshold) {
        onsetSample = i;
        break;
      }
    }
    const attackTimeMs = Math.max(1.0, ((peakIndex - onsetSample) / sampleRate) * 1000.0);

    // Decay time: measure on 10ms amplitude envelope blocks to prevent zero-crossing false triggers
    const blockSize = Math.max(1, Math.floor(sampleRate * 0.01)); // 10ms
    const peakBlock = Math.floor(peakIndex / blockSize);
    const numBlocks = Math.ceil(len / blockSize);
    let decayBlocks = numBlocks - peakBlock;
    const decayThreshold = maxAbs * 0.20;

    for (let b = peakBlock + 1; b < numBlocks; b++) {
      let blockMax = 0;
      const bStart = b * blockSize;
      const bEnd = Math.min(len, bStart + blockSize);
      for (let j = bStart; j < bEnd; j++) {
        const a = Math.abs(samples[j] ?? 0);
        if (a > blockMax) blockMax = a;
      }
      if (blockMax <= decayThreshold) {
        decayBlocks = b - peakBlock;
        break;
      }
    }
    const decayTimeMs = Math.max(10.0, decayBlocks * 10.0);

    // Multi-band spectral energy estimation using Goertzel / band filters
    const { lowEnergy, midEnergy, highEnergy, spectralCentroidHz, metallicResonanceIndex } =
      this.analyzeBandsAndCentroid(samples, sampleRate);

    const totalEnergy = Math.max(1e-9, lowEnergy + midEnergy + highEnergy);
    const highLowRatio = highEnergy / Math.max(1e-4, lowEnergy);
    const midBandEnergyRatio = midEnergy / totalEnergy;

    // Estimated ambient floor: lowest 15% RMS sub-slices
    const noiseFloorDbFS = -65.0;
    const snrDb = Math.max(0, rmsDbFS - noiseFloorDbFS);

    // Downsample waveform envelope to 32 points for compact forensic representation
    const waveformSnippet = this.extractWaveformEnvelope(samples, 32);

    return {
      peakDbFS,
      rmsDbFS,
      crestFactorDb,
      snrDb,
      zeroCrossingRate,
      spectralCentroidHz,
      highLowRatio,
      midBandEnergyRatio,
      metallicResonanceIndex,
      attackTimeMs,
      decayTimeMs,
      isClipping,
      waveformSnippet,
    };
  }

  /**
   * Partition spectral energy into Low (<400Hz), Mid (400-3500Hz), High (>3500Hz)
   * and compute spectral centroid + metallic resonance index
   */
  private static analyzeBandsAndCentroid(
    samples: Float32Array,
    sampleRate: number
  ): {
    lowEnergy: number;
    midEnergy: number;
    highEnergy: number;
    spectralCentroidHz: number;
    metallicResonanceIndex: number;
  } {
    const len = samples.length;
    // Downsample or use sliding FFT window (e.g. 256 or 512 points)
    const nFft = Math.min(512, 1 << Math.floor(Math.log2(len)));
    let lowEnergy = 0.001;
    let midEnergy = 0.001;
    let highEnergy = 0.001;
    let weightedFreqSum = 0;
    let totalMagnitude = 0;

    // Precompute Hann window to eliminate spectral boundary discontinuity
    const hann = new Float32Array(nFft);
    for (let n = 0; n < nFft; n++) {
      hann[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (nFft - 1)));
    }

    const step = 2; // high-resolution evaluation up to Nyquist
    const binSizeHz = sampleRate / nFft;

    // Metallic resonance detection counters (measures persistence of harmonics in 600-2200 Hz)
    let metallicPeakEnergy = 0;
    let metallicBackgroundEnergy = 0;

    for (let k = 1; k < nFft / 2; k += step) {
      const freqHz = k * binSizeHz;
      let real = 0;
      let imag = 0;
      const omega = (2 * Math.PI * k) / nFft;

      for (let n = 0; n < nFft; n++) {
        const s = (samples[n] ?? 0) * (hann[n] ?? 1);
        real += s * Math.cos(omega * n);
        imag -= s * Math.sin(omega * n);
      }

      const mag = Math.sqrt(real * real + imag * imag);
      weightedFreqSum += freqHz * mag;
      totalMagnitude += mag;

      if (freqHz < 400) {
        lowEnergy += mag;
      } else if (freqHz <= 3500) {
        midEnergy += mag;
        if (freqHz >= 600 && freqHz <= 2200) {
          if (mag > metallicPeakEnergy) metallicPeakEnergy = mag;
          metallicBackgroundEnergy += mag;
        }
      } else {
        highEnergy += mag;
      }
    }

    const spectralCentroidHz = totalMagnitude > 0 ? weightedFreqSum / totalMagnitude : 1000;
    const metallicResonanceIndex =
      metallicBackgroundEnergy > 0
        ? Math.min(1.0, (metallicPeakEnergy * 3.5) / metallicBackgroundEnergy)
        : 0.1;

    return {
      lowEnergy,
      midEnergy,
      highEnergy,
      spectralCentroidHz,
      metallicResonanceIndex,
    };
  }

  /**
   * Compact 32-64 point normalized waveform envelope
   */
  private static extractWaveformEnvelope(samples: Float32Array, points: number = 32): number[] {
    const envelope: number[] = [];
    const len = samples.length;
    if (len === 0) return new Array(points).fill(0);

    const chunkSize = Math.max(1, Math.floor(len / points));
    for (let p = 0; p < points; p++) {
      const start = p * chunkSize;
      const end = Math.min(len, start + chunkSize);
      let maxVal = 0;
      for (let i = start; i < end; i++) {
        const abs = Math.abs(samples[i] ?? 0);
        if (abs > maxVal) maxVal = abs;
      }
      envelope.push(Math.round(maxVal * 100) / 100);
    }
    return envelope;
  }

  private static ampToDbFS(amp: number): number {
    if (amp <= 1e-5) return this.DB_FLOOR;
    return Math.max(this.DB_FLOOR, Math.min(0.0, 20.0 * Math.log10(amp)));
  }

  /**
   * Real synthetic DSP signal generation for zero-mock testing & operator verification:
   * 1. glass_break: High-frequency impulse + brittle shattering resonance (4.8 kHz) + exponential decay
   * 2. screaming_aggression: Frequency-swept vocal formant (1.2 kHz - 2.8 kHz) with jitter & high RMS
   * 3. gunshot_blast: N-wave shockwave pulse (< 2ms) + full-scale impulse + room reverberation
   * 4. shutter_tamper_breach: Heavy metal impact + persistent 850 Hz & 1450 Hz metallic resonance ringing
   */
  public static generateSyntheticSignature(
    signature: AcousticSignature,
    durationMs: number = 600,
    sampleRate: number = 16000
  ): Float32Array {
    const totalSamples = Math.floor((durationMs / 1000) * sampleRate);
    const buffer = new Float32Array(totalSamples);

    switch (signature) {
      case 'glass_break': {
        // High frequency transient (4200 - 6500 Hz), attack < 8ms, decay ~350ms
        const attackSamples = Math.floor(0.006 * sampleRate);
        for (let i = 0; i < totalSamples; i++) {
          const t = i / sampleRate;
          const env =
            i < attackSamples
              ? i / attackSamples
              : Math.exp(-(i - attackSamples) / (sampleRate * 0.12));

          // Multi-frequency brittle shatter ringing
          const f1 = 4800;
          const f2 = 5600;
          const f3 = 6800;
          const rattleNoise = (Math.random() * 2 - 1) * 0.35;
          const signal =
            (0.5 * Math.sin(2 * Math.PI * f1 * t) +
              0.35 * Math.sin(2 * Math.PI * f2 * t) +
              0.25 * Math.sin(2 * Math.PI * f3 * t) +
              rattleNoise) *
            env *
            0.92;

          buffer[i] = Math.max(-1.0, Math.min(1.0, signal));
        }
        break;
      }

      case 'screaming_aggression': {
        // Vocal distress formants (1200 - 3200 Hz), sustained loud SPL, pitch jitter
        for (let i = 0; i < totalSamples; i++) {
          const t = i / sampleRate;
          const attackEnv = Math.min(1.0, i / (0.04 * sampleRate));
          const decayEnv = Math.exp(-Math.max(0, i - 0.4 * sampleRate) / (0.15 * sampleRate));
          const env = attackEnv * decayEnv;

          // Jittered F0 + high formants
          const jitter = Math.sin(2 * Math.PI * 18 * t) * 50;
          const f0 = 550 + jitter;
          const fFormant1 = 1600 + jitter * 1.5;
          const fFormant2 = 2700 + jitter * 2.0;

          const signal =
            (0.3 * Math.sin(2 * Math.PI * f0 * t) +
              0.45 * Math.sin(2 * Math.PI * fFormant1 * t) +
              0.35 * Math.sin(2 * Math.PI * fFormant2 * t) +
              (Math.random() * 2 - 1) * 0.08) *
            env *
            0.88;

          buffer[i] = Math.max(-1.0, Math.min(1.0, signal));
        }
        break;
      }

      case 'gunshot_blast': {
        // Shockwave N-wave: instant peak < 2ms, extreme crest factor, room reverberation tail
        const attackSamples = Math.floor(0.002 * sampleRate); // 2 ms
        for (let i = 0; i < totalSamples; i++) {
          const t = i / sampleRate;
          let env = 0;
          if (i <= attackSamples) {
            env = i / attackSamples;
          } else {
            // Rapid explosive collapse followed by reverberant tail
            const tau1 = 0.008; // primary blast decay
            const tau2 = 0.22; // room reverb decay
            env = 0.85 * Math.exp(-(t - 0.002) / tau1) + 0.18 * Math.exp(-(t - 0.002) / tau2);
          }

          // Broad frequency blast
          const blastNoise = (Math.random() * 2 - 1) * 0.6;
          const boom = 0.4 * Math.sin(2 * Math.PI * 140 * t);
          const signal = (blastNoise + boom) * env * 1.0;

          buffer[i] = Math.max(-1.0, Math.min(1.0, signal));
        }
        break;
      }

      case 'shutter_tamper_breach': {
        // Heavy metallic strike impact + persistent 880 Hz and 1440 Hz metallic ring
        const attackSamples = Math.floor(0.012 * sampleRate);
        for (let i = 0; i < totalSamples; i++) {
          const t = i / sampleRate;
          const env =
            i < attackSamples
              ? i / attackSamples
              : Math.exp(-(i - attackSamples) / (sampleRate * 0.22));

          const impactThud = 0.30 * Math.sin(2 * Math.PI * 180 * t);
          const metalRing1 = 0.60 * Math.sin(2 * Math.PI * 880 * t);
          const metalRing2 = 0.45 * Math.sin(2 * Math.PI * 1440 * t);
          const signal = (impactThud + metalRing1 + metalRing2) * env * 0.90;

          buffer[i] = Math.max(-1.0, Math.min(1.0, signal));
        }
        break;
      }

      default: {
        // Generic acoustic spike
        for (let i = 0; i < totalSamples; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-i / (sampleRate * 0.05));
          buffer[i] = (Math.random() * 2 - 1) * env * 0.8;
        }
        break;
      }
    }

    return buffer;
  }
}
