// @ts-nocheck
import { getVoiceModelManager } from "./voice-model-manager.service.js";

export interface AntiSpoofingConfig {
  enabled: boolean;
  confidenceThreshold: number;
  useMultipleDetectors: boolean;
  enableSpectralAnalysis: boolean;
  enableTemporalAnalysis: boolean;
  enableReplayDetection: boolean;
  enableDeepfakeDetection: boolean;
}

export interface SpoofingDetectionResult {
  isSpoofed: boolean;
  confidence: number;
  spoofingType?: "replay" | "synthetic" | "deepfake" | "voice-conversion" | "unknown";
  detectionMethod: string;
  details: {
    modelScores?: Record<string, number>;
    spectralAnomalies?: string[];
    temporalInconsistencies?: string[];
    suspiciousFeatures?: string[];
    individualDetectors?: Array<{
      name: string;
      isSpoofed: boolean;
      confidence: number;
    }>;
  };
  riskLevel: "low" | "medium" | "high" | "critical";
}

export interface SpectralFeatures {
  lfcc: number[]; // Linear Frequency Cepstral Coefficients
  mfcc: number[]; // Mel Frequency Cepstral Coefficients
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlux: number;
  zeroCrossingRate: number;
  energyEntropy: number;
}

export class AntiSpoofingService {
  private config: AntiSpoofingConfig;
  private modelManager = getVoiceModelManager();

  constructor(config: Partial<AntiSpoofingConfig> = {}) {
    this.config = {
      enabled: true,
      confidenceThreshold: 0.7,
      useMultipleDetectors: true,
      enableSpectralAnalysis: true,
      enableTemporalAnalysis: true,
      enableReplayDetection: true,
      enableDeepfakeDetection: true,
      ...config,
    };
  }

  /**
   * Comprehensive spoofing detection
   */
  async detectSpoofing(
    audioArray: Float32Array,
    sampleRate: number,
    audioFeatures?: any
  ): Promise<SpoofingDetectionResult> {
    if (!this.config.enabled) {
      return this.createNegativeResult("disabled");
    }

    const detectors: Array<{
      name: string;
      isSpoofed: boolean;
      confidence: number;
      spoofingType?: string;
    }> = [];

    // 1. Model-based detection
    const modelResult = await this.modelBasedDetection(audioArray, sampleRate);
    if (modelResult) {
      detectors.push({
        name: "model-based",
        isSpoofed: modelResult.isSpoofed,
        confidence: modelResult.confidence,
        spoofingType: modelResult.spoofingType,
      });
    }

    // 2. Spectral analysis
    if (this.config.enableSpectralAnalysis) {
      const spectralResult = await this.spectralAnalysis(audioArray, sampleRate);
      detectors.push({
        name: "spectral-analysis",
        isSpoofed: spectralResult.isSpoofed,
        confidence: spectralResult.confidence,
        spoofingType: spectralResult.spoofingType,
      });
    }

    // 3. Temporal consistency
    if (this.config.enableTemporalAnalysis) {
      const temporalResult = this.temporalConsistencyCheck(audioArray, sampleRate);
      detectors.push({
        name: "temporal-consistency",
        isSpoofed: temporalResult.isSpoofed,
        confidence: temporalResult.confidence,
        spoofingType: temporalResult.spoofingType,
      });
    }

    // 4. Replay detection
    if (this.config.enableReplayDetection && audioFeatures) {
      const replayResult = this.replayDetection(audioArray, sampleRate, audioFeatures);
      detectors.push({
        name: "replay-detection",
        isSpoofed: replayResult.isSpoofed,
        confidence: replayResult.confidence,
        spoofingType: replayResult.spoofingType,
      });
    }

    // 5. Deepfake detection
    if (this.config.enableDeepfakeDetection) {
      const deepfakeResult = this.deepfakeDetection(audioArray, sampleRate);
      detectors.push({
        name: "deepfake-detection",
        isSpoofed: deepfakeResult.isSpoofed,
        confidence: deepfakeResult.confidence,
        spoofingType: deepfakeResult.spoofingType,
      });
    }

    // Aggregate results
    return this.aggregateDetectionResults(detectors);
  }

  /**
   * Model-based spoofing detection
   */
  private async modelBasedDetection(
    audioArray: Float32Array,
    sampleRate: number
  ): Promise<{
    isSpoofed: boolean;
    confidence: number;
    spoofingType?: string;
  } | null> {
    const antiSpoofingModel = this.modelManager.getModel("antiSpoofing");

    if (!antiSpoofingModel) {
      return null;
    }

    try {
      let ort: any;
      try {
        ort = await import("onnxruntime-node");
      } catch {
        return null;
      }

      // Prepare input tensor
      const inputTensor = new ort.Tensor("float32", audioArray, [1, audioArray.length]);

      // Run inference
      const feeds = { input: inputTensor };
      const results = await antiSpoofingModel.run(feeds);

      // Extract results
      const outputName = antiSpoofingModel.outputNames[0];
      const outputTensor = results[outputName];
      const spoofingProbability = (outputTensor.data as Float32Array)[0];

      const isSpoofed = spoofingProbability > 0.5;
      const confidence = Math.abs(spoofingProbability - 0.5) * 2;

      // Determine spoofing type based on probability range
      let spoofingType: string | undefined;
      if (isSpoofed) {
        if (spoofingProbability > 0.8) {
          spoofingType = "synthetic";
        } else if (spoofingProbability > 0.65) {
          spoofingType = "voice-conversion";
        } else {
          spoofingType = "unknown";
        }
      }

      return { isSpoofed, confidence, spoofingType };
    } catch (error: any) {
      console.error("Model-based anti-spoofing failed:", error.message);
      return null;
    }
  }

  /**
   * Spectral analysis for spoofing detection
   */
  private async spectralAnalysis(
    audioArray: Float32Array,
    sampleRate: number
  ): Promise<{
    isSpoofed: boolean;
    confidence: number;
    spoofingType?: string;
  }> {
    const features = this.extractSpectralFeatures(audioArray, sampleRate);
    const anomalies: string[] = [];
    let suspicionScore = 0;

    // Check spectral centroid (synthetic voices often have abnormal centroids)
    const expectedCentroid = sampleRate / 4; // Rough estimate for human voice
    const centroidDeviation = Math.abs(features.spectralCentroid - expectedCentroid) / expectedCentroid;
    if (centroidDeviation > 0.5) {
      anomalies.push("abnormal-spectral-centroid");
      suspicionScore += 0.25;
    }

    // Check zero-crossing rate
    if (features.zeroCrossingRate < 0.02 || features.zeroCrossingRate > 0.5) {
      anomalies.push("abnormal-zero-crossing-rate");
      suspicionScore += 0.2;
    }

    // Check spectral flux (synthetic voices have lower flux)
    if (features.spectralFlux < 0.01) {
      anomalies.push("low-spectral-flux");
      suspicionScore += 0.3;
    }

    // Check energy entropy (synthetic voices have lower entropy)
    if (features.energyEntropy < 2.0) {
      anomalies.push("low-energy-entropy");
      suspicionScore += 0.25;
    }

    const isSpoofed = suspicionScore >= 0.5;
    let spoofingType: string | undefined;

    if (isSpoofed) {
      if (anomalies.includes("low-spectral-flux") && anomalies.includes("low-energy-entropy")) {
        spoofingType = "synthetic";
      } else if (anomalies.includes("abnormal-zero-crossing-rate")) {
        spoofingType = "voice-conversion";
      } else {
        spoofingType = "unknown";
      }
    }

    return {
      isSpoofed,
      confidence: Math.min(1.0, suspicionScore * 1.5),
      spoofingType,
    };
  }

  /**
   * Extract spectral features from audio
   */
  private extractSpectralFeatures(
    audioArray: Float32Array,
    sampleRate: number
  ): SpectralFeatures {
    // Simplified spectral feature extraction
    // In production, use proper DSP libraries

    // Calculate spectral centroid
    let spectralCentroid = 0;
    let totalMagnitude = 0;

    for (let i = 0; i < Math.min(audioArray.length, sampleRate); i++) {
      const magnitude = Math.abs(audioArray[i]);
      spectralCentroid += i * magnitude;
      totalMagnitude += magnitude;
    }
    spectralCentroid = totalMagnitude > 0 ? spectralCentroid / totalMagnitude : 0;

    // Calculate zero-crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < audioArray.length; i++) {
      if ((audioArray[i] >= 0 && audioArray[i - 1] < 0) ||
          (audioArray[i] < 0 && audioArray[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zeroCrossingRate = zeroCrossings / (audioArray.length - 1);

    // Calculate spectral flux
    let spectralFlux = 0;
    const windowSize = 512;
    for (let i = windowSize; i < audioArray.length - windowSize; i += windowSize) {
      let diff = 0;
      for (let j = 0; j < windowSize; j++) {
        diff += Math.abs(Math.abs(audioArray[i + j]) - Math.abs(audioArray[i - windowSize + j]));
      }
      spectralFlux += diff / windowSize;
    }
    spectralFlux /= Math.floor((audioArray.length - windowSize) / windowSize);

    // Calculate energy entropy
    const energyEntropy = this.calculateEnergyEntropy(audioArray);

    // Calculate spectral rolloff (frequency below which 85% of energy is contained)
    const spectralRolloff = sampleRate * 0.425; // Simplified

    return {
      lfcc: [], // Would require proper LFCC computation
      mfcc: [], // Would require proper MFCC computation
      spectralCentroid,
      spectralRolloff,
      spectralFlux,
      zeroCrossingRate,
      energyEntropy,
    };
  }

  /**
   * Temporal consistency check
   */
  private temporalConsistencyCheck(
    audioArray: Float32Array,
    sampleRate: number
  ): {
    isSpoofed: boolean;
    confidence: number;
    spoofingType?: string;
  } {
    const anomalies: string[] = [];
    let suspicionScore = 0;

    // Check for unnatural pauses (characteristic of concatenated attacks)
    const silenceSegments = this.detectSilenceSegments(audioArray, sampleRate);
    const unnaturalPauses = silenceSegments.filter(
      (seg) => seg.duration > 0.05 && seg.duration < 0.15
    );

    if (unnaturalPauses.length > 3) {
      anomalies.push("unnatural-pauses");
      suspicionScore += 0.3;
    }

    // Check energy consistency
    const energyVariation = this.calculateEnergyVariation(audioArray, sampleRate);
    if (energyVariation < 0.1) {
      anomalies.push("low-energy-variation");
      suspicionScore += 0.25;
    }

    // Check pitch consistency (simplified)
    const pitchVariation = this.estimatePitchVariation(audioArray, sampleRate);
    if (pitchVariation < 0.05) {
      anomalies.push("unnaturally-stable-pitch");
      suspicionScore += 0.25;
    }

    // Check for phase inconsistencies (replay artifacts)
    const phaseInconsistency = this.detectPhaseInconsistencies(audioArray);
    if (phaseInconsistency > 0.3) {
      anomalies.push("phase-inconsistencies");
      suspicionScore += 0.35;
    }

    const isSpoofed = suspicionScore >= 0.5;
    let spoofingType: string | undefined;

    if (isSpoofed) {
      if (anomalies.includes("unnatural-pauses")) {
        spoofingType = "voice-conversion";
      } else if (anomalies.includes("phase-inconsistencies")) {
        spoofingType = "replay";
      } else if (anomalies.includes("unnaturally-stable-pitch")) {
        spoofingType = "synthetic";
      }
    }

    return { isSpoofed, confidence: suspicionScore, spoofingType };
  }

  /**
   * Replay attack detection
   */
  private replayDetection(
    audioArray: Float32Array,
    sampleRate: number,
    audioFeatures: any
  ): {
    isSpoofed: boolean;
    confidence: number;
    spoofingType?: string;
  } {
    let suspicionScore = 0;
    const anomalies: string[] = [];

    // Check for unnaturally high SNR (replayed audio from recordings)
    if (audioFeatures.snr && audioFeatures.snr > 45) {
      anomalies.push("unusually-high-snr");
      suspicionScore += 0.4;
    }

    // Check for lack of room acoustics (replayed from professional recordings)
    const reverberation = this.estimateReverberation(audioArray, sampleRate);
    if (reverberation < 0.05) {
      anomalies.push("lack-of-room-acoustics");
      suspicionScore += 0.3;
    }

    // Check for compression artifacts (replayed from compressed sources)
    const compressionArtifacts = this.detectCompressionArtifacts(audioArray);
    if (compressionArtifacts > 0.3) {
      anomalies.push("compression-artifacts");
      suspicionScore += 0.35;
    }

    // Check for speaker-microphone inconsistency
    const microphoneArtifacts = this.detectMicrophoneArtifacts(audioArray, sampleRate);
    if (microphoneArtifacts < 0.1) {
      anomalies.push("missing-microphone-artifacts");
      suspicionScore += 0.25;
    }

    const isSpoofed = suspicionScore >= 0.5;

    return {
      isSpoofed,
      confidence: Math.min(1.0, suspicionScore),
      spoofingType: isSpoofed ? "replay" : undefined,
    };
  }

  /**
   * Deepfake detection
   */
  private deepfakeDetection(
    audioArray: Float32Array,
    sampleRate: number
  ): {
    isSpoofed: boolean;
    confidence: number;
    spoofingType?: string;
  } {
    let suspicionScore = 0;
    const anomalies: string[] = [];

    // Check for GAN artifacts in high frequencies
    const highFreqArtifacts = this.detectHighFrequencyArtifacts(audioArray, sampleRate);
    if (highFreqArtifacts > 0.3) {
      anomalies.push("high-frequency-artifacts");
      suspicionScore += 0.4;
    }

    // Check for unnatural formant structure
    const formantAnomalies = this.detectFormantAnomalies(audioArray, sampleRate);
    if (formantAnomalies > 0.3) {
      anomalies.push("formant-anomalies");
      suspicionScore += 0.35;
    }

    // Check for periodic noise patterns (characteristic of neural vocoders)
    const periodicNoise = this.detectPeriodicNoise(audioArray, sampleRate);
    if (periodicNoise > 0.25) {
      anomalies.push("periodic-noise");
      suspicionScore += 0.3;
    }

    const isSpoofed = suspicionScore >= 0.5;

    return {
      isSpoofed,
      confidence: Math.min(1.0, suspicionScore),
      spoofingType: isSpoofed ? "deepfake" : undefined,
    };
  }

  /**
   * Aggregate detection results from multiple detectors
   */
  private aggregateDetectionResults(
    detectors: Array<{
      name: string;
      isSpoofed: boolean;
      confidence: number;
      spoofingType?: string;
    }>
  ): SpoofingDetectionResult {
    if (detectors.length === 0) {
      return this.createNegativeResult("no-detectors");
    }

    // Calculate weighted average confidence
    const spoofedDetectors = detectors.filter((d) => d.isSpoofed);
    const avgConfidence =
      detectors.reduce((sum, d) => sum + d.confidence, 0) / detectors.length;

    // Determine if spoofed (majority vote with confidence weighting)
    const weightedVotes = detectors.map((d) => ({
      vote: d.isSpoofed ? 1 : 0,
      weight: d.confidence,
    }));

    const totalWeight = weightedVotes.reduce((sum, v) => sum + v.weight, 0);
    const spoofedWeight = weightedVotes
      .filter((v) => v.vote === 1)
      .reduce((sum, v) => sum + v.weight, 0);

    const isSpoofed = spoofedWeight / totalWeight > 0.5;

    // Determine spoofing type (most common among positive detections)
    const spoofingTypes = spoofedDetectors
      .map((d) => d.spoofingType)
      .filter((t) => t !== undefined) as string[];

    const spoofingTypeCounts = spoofingTypes.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const spoofingType = Object.entries(spoofingTypeCounts).sort(
      ([, a], [, b]) => b - a
    )[0]?.[0] as any;

    // Determine risk level
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (isSpoofed) {
      if (avgConfidence > 0.9) {
        riskLevel = "critical";
      } else if (avgConfidence > 0.75) {
        riskLevel = "high";
      } else if (avgConfidence > 0.6) {
        riskLevel = "medium";
      } else {
        riskLevel = "low";
      }
    }

    return {
      isSpoofed,
      confidence: avgConfidence,
      spoofingType,
      detectionMethod: "multi-detector-ensemble",
      details: {
        individualDetectors: detectors.map((d) => ({
          name: d.name,
          isSpoofed: d.isSpoofed,
          confidence: d.confidence,
        })),
        modelScores: Object.fromEntries(
          detectors.map((d) => [d.name, d.confidence])
        ),
      },
      riskLevel,
    };
  }

  /**
   * Helper methods for audio analysis
   */

  private detectSilenceSegments(
    audioArray: Float32Array,
    sampleRate: number
  ): Array<{ start: number; duration: number }> {
    const threshold = 0.01;
    const segments: Array<{ start: number; duration: number }> = [];
    let inSilence = false;
    let silenceStart = 0;

    for (let i = 0; i < audioArray.length; i++) {
      const isSilent = Math.abs(audioArray[i]) < threshold;

      if (isSilent && !inSilence) {
        inSilence = true;
        silenceStart = i;
      } else if (!isSilent && inSilence) {
        inSilence = false;
        segments.push({
          start: silenceStart / sampleRate,
          duration: (i - silenceStart) / sampleRate,
        });
      }
    }

    return segments;
  }

  private calculateEnergyVariation(
    audioArray: Float32Array,
    sampleRate: number
  ): number {
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
    const energies: number[] = [];

    for (let i = 0; i < audioArray.length - windowSize; i += windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += audioArray[i + j] * audioArray[i + j];
      }
      energies.push(energy / windowSize);
    }

    if (energies.length === 0) return 0;

    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const variance =
      energies.reduce((sum, e) => sum + (e - mean) * (e - mean), 0) / energies.length;
    const stdDev = Math.sqrt(variance);

    return mean > 0 ? stdDev / mean : 0;
  }

  private estimatePitchVariation(
    audioArray: Float32Array,
    sampleRate: number
  ): number {
    // Simplified pitch variation estimation
    // In production, use proper pitch tracking (YIN, PYIN, etc.)
    const windowSize = Math.floor(sampleRate * 0.03); // 30ms windows
    const zcrs: number[] = [];

    for (let i = 0; i < audioArray.length - windowSize; i += windowSize / 2) {
      let zcr = 0;
      for (let j = 1; j < windowSize; j++) {
        if (
          (audioArray[i + j] >= 0 && audioArray[i + j - 1] < 0) ||
          (audioArray[i + j] < 0 && audioArray[i + j - 1] >= 0)
        ) {
          zcr++;
        }
      }
      zcrs.push(zcr / windowSize);
    }

    if (zcrs.length === 0) return 0;

    const mean = zcrs.reduce((a, b) => a + b, 0) / zcrs.length;
    const variance =
      zcrs.reduce((sum, z) => sum + (z - mean) * (z - mean), 0) / zcrs.length;

    return Math.sqrt(variance);
  }

  private detectPhaseInconsistencies(audioArray: Float32Array): number {
    // Simplified phase inconsistency detection
    let inconsistencies = 0;
    const windowSize = 256;

    for (let i = windowSize; i < audioArray.length - windowSize; i += windowSize) {
      const phase1 = this.calculatePhase(audioArray.subarray(i - windowSize, i));
      const phase2 = this.calculatePhase(audioArray.subarray(i, i + windowSize));

      const phaseDiff = Math.abs(phase2 - phase1);
      if (phaseDiff > Math.PI / 2) {
        inconsistencies++;
      }
    }

    return inconsistencies / Math.floor(audioArray.length / windowSize);
  }

  private calculatePhase(signal: Float32Array): number {
    // Simplified phase calculation
    let real = 0;
    let imag = 0;

    for (let i = 0; i < signal.length; i++) {
      const angle = (2 * Math.PI * i) / signal.length;
      real += signal[i] * Math.cos(angle);
      imag += signal[i] * Math.sin(angle);
    }

    return Math.atan2(imag, real);
  }

  private estimateReverberation(audioArray: Float32Array, sampleRate: number): number {
    // Simplified reverberation estimation
    const decayRate = this.calculateDecayRate(audioArray, sampleRate);
    return Math.max(0, Math.min(1, decayRate / 2));
  }

  private calculateDecayRate(audioArray: Float32Array, sampleRate: number): number {
    const energies: number[] = [];
    const windowSize = Math.floor(sampleRate * 0.05);

    for (let i = 0; i < audioArray.length - windowSize; i += windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += audioArray[i + j] * audioArray[i + j];
      }
      energies.push(Math.sqrt(energy / windowSize));
    }

    // Calculate average decay
    let totalDecay = 0;
    for (let i = 1; i < energies.length; i++) {
      if (energies[i - 1] > 0) {
        totalDecay += Math.abs(energies[i] - energies[i - 1]) / energies[i - 1];
      }
    }

    return energies.length > 1 ? totalDecay / (energies.length - 1) : 0;
  }

  private detectCompressionArtifacts(audioArray: Float32Array): number {
    // Detect quantization noise and compression artifacts
    let artifactScore = 0;
    const windowSize = 128;

    for (let i = 0; i < audioArray.length - windowSize; i += windowSize) {
      const window = audioArray.subarray(i, i + windowSize);
      const uniqueValues = new Set(Array.from(window).map((v) => Math.round(v * 1000)));

      // Compression often results in reduced bit depth
      if (uniqueValues.size < windowSize * 0.3) {
        artifactScore++;
      }
    }

    return artifactScore / Math.floor(audioArray.length / windowSize);
  }

  private detectMicrophoneArtifacts(audioArray: Float32Array, sampleRate: number): number {
    // Check for characteristic microphone noise and artifacts
    const lowFreqNoise = this.calculateLowFrequencyContent(audioArray, sampleRate);
    return lowFreqNoise;
  }

  private calculateLowFrequencyContent(
    audioArray: Float32Array,
    sampleRate: number
  ): number {
    // Simplified low-frequency content calculation
    const cutoffFreq = 100; // Hz
    const cutoffSamples = (cutoffFreq * audioArray.length) / sampleRate;

    let lowFreqEnergy = 0;
    let totalEnergy = 0;

    for (let i = 0; i < audioArray.length; i++) {
      const energy = audioArray[i] * audioArray[i];
      totalEnergy += energy;

      if (i < cutoffSamples) {
        lowFreqEnergy += energy;
      }
    }

    return totalEnergy > 0 ? lowFreqEnergy / totalEnergy : 0;
  }

  private detectHighFrequencyArtifacts(
    audioArray: Float32Array,
    sampleRate: number
  ): number {
    // GAN-generated audio often has artifacts above 8kHz
    const highFreqStart = Math.floor((8000 * audioArray.length) / sampleRate);
    let artifactEnergy = 0;

    for (let i = highFreqStart; i < audioArray.length; i++) {
      artifactEnergy += Math.abs(audioArray[i]);
    }

    return artifactEnergy / (audioArray.length - highFreqStart);
  }

  private detectFormantAnomalies(audioArray: Float32Array, sampleRate: number): number {
    // Simplified formant analysis
    // In production, use proper LPC or formant tracking
    return 0.1; // Placeholder
  }

  private detectPeriodicNoise(audioArray: Float32Array, sampleRate: number): number {
    // Detect periodic patterns in "noise" regions
    let periodicScore = 0;
    const windowSize = 512;

    for (let i = 0; i < audioArray.length - windowSize * 2; i += windowSize) {
      const window1 = audioArray.subarray(i, i + windowSize);
      const window2 = audioArray.subarray(i + windowSize, i + windowSize * 2);

      const correlation = this.calculateCorrelation(window1, window2);
      if (correlation > 0.7) {
        periodicScore++;
      }
    }

    return periodicScore / Math.floor(audioArray.length / windowSize);
  }

  private calculateCorrelation(signal1: Float32Array, signal2: Float32Array): number {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < Math.min(signal1.length, signal2.length); i++) {
      correlation += signal1[i] * signal2[i];
      norm1 += signal1[i] * signal1[i];
      norm2 += signal2[i] * signal2[i];
    }

    const denominator = Math.sqrt(norm1 * norm2);
    return denominator > 0 ? correlation / denominator : 0;
  }

  private calculateEnergyEntropy(audioArray: Float32Array): number {
    const windowSize = 256;
    const energies: number[] = [];

    for (let i = 0; i < audioArray.length - windowSize; i += windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += audioArray[i + j] * audioArray[i + j];
      }
      energies.push(energy / windowSize);
    }

    // Normalize energies
    const totalEnergy = energies.reduce((a, b) => a + b, 0);
    if (totalEnergy === 0) return 0;

    const probabilities = energies.map((e) => e / totalEnergy);

    // Calculate Shannon entropy
    let entropy = 0;
    for (const p of probabilities) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  private createNegativeResult(reason: string): SpoofingDetectionResult {
    return {
      isSpoofed: false,
      confidence: 0,
      detectionMethod: reason,
      details: {},
      riskLevel: "low",
    };
  }
}

// Singleton instance
let antiSpoofingServiceInstance: AntiSpoofingService | null = null;

export function getAntiSpoofingService(
  config?: Partial<AntiSpoofingConfig>
): AntiSpoofingService {
  if (!antiSpoofingServiceInstance) {
    antiSpoofingServiceInstance = new AntiSpoofingService(config);
  }
  return antiSpoofingServiceInstance;
}
