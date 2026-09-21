/**
 * Voice Metrics Service
 * 
 * Production-grade monitoring and metrics collection for voice biometric system.
 * Compatible with Prometheus, StatsD, and custom monitoring solutions.
 */

export interface VoiceMetrics {
  // Authentication metrics
  authAttempts: number;
  authSuccesses: number;
  authFailures: number;
  authSuccessRate: number;
  avgAuthDuration: number;
  
  // Enrollment metrics
  enrollmentStarts: number;
  enrollmentCompletions: number;
  enrollmentFailures: number;
  avgSamplesPerEnrollment: number;
  
  // Quality metrics
  avgAudioQuality: number;
  avgSnr: number;
  avgConfidenceScore: number;
  avgSimilarityScore: number;
  
  // Security metrics
  spoofingAttempts: number;
  spoofingBlocked: number;
  livenessFailures: number;
  replayAttacks: number;
  syntheticDetections: number;
  deepfakeDetections: number;
  
  // Performance metrics
  avgProcessingTime: number;
  avgEmbeddingTime: number;
  avgAntiSpoofingTime: number;
  modelInferenceErrors: number;
  
  // System health
  circuitBreakerTrips: number;
  retryAttempts: number;
  fallbackActivations: number;
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export class VoiceMetricsService {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private timers: Map<string, number> = new Map();

  /**
   * Increment counter
   */
  incrementCounter(name: string, value: number = 1, tags?: Record<string, string>) {
    const key = this.buildKey(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  /**
   * Set gauge value
   */
  setGauge(name: string, value: number, tags?: Record<string, string>) {
    const key = this.buildKey(name, tags);
    this.gauges.set(key, value);
  }

  /**
   * Record histogram value
   */
  recordHistogram(name: string, value: number, tags?: Record<string, string>) {
    const key = this.buildKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    
    // Keep last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    
    this.histograms.set(key, values);
  }

  /**
   * Start timer
   */
  startTimer(name: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.recordHistogram(name, duration);
    };
  }

  /**
   * Track authentication attempt
   */
  trackAuthAttempt(success: boolean, duration: number, details?: {
    similarityScore?: number;
    confidenceScore?: number;
    authMethod?: string;
  }) {
    this.incrementCounter("voice.auth.attempts.total");
    
    if (success) {
      this.incrementCounter("voice.auth.success");
    } else {
      this.incrementCounter("voice.auth.failures");
    }
    
    this.recordHistogram("voice.auth.duration", duration);
    
    if (details?.similarityScore !== undefined) {
      this.recordHistogram("voice.auth.similarity_score", details.similarityScore);
    }
    
    if (details?.confidenceScore !== undefined) {
      this.recordHistogram("voice.auth.confidence_score", details.confidenceScore);
    }
    
    if (details?.authMethod) {
      this.incrementCounter("voice.auth.attempts.by_method", 1, {
        method: details.authMethod
      });
    }
  }

  /**
   * Track enrollment
   */
  trackEnrollment(stage: "start" | "sample" | "complete" | "failure", details?: {
    sampleCount?: number;
    qualityScore?: number;
  }) {
    this.incrementCounter(`voice.enrollment.${stage}`);
    
    if (stage === "sample" && details?.qualityScore !== undefined) {
      this.recordHistogram("voice.enrollment.quality_score", details.qualityScore);
    }
    
    if (stage === "complete" && details?.sampleCount !== undefined) {
      this.recordHistogram("voice.enrollment.samples_count", details.sampleCount);
    }
  }

  /**
   * Track audio quality
   */
  trackAudioQuality(snr?: number, silenceRatio?: number, duration?: number) {
    if (snr !== undefined) {
      this.recordHistogram("voice.audio.snr", snr);
    }
    
    if (silenceRatio !== undefined) {
      this.recordHistogram("voice.audio.silence_ratio", silenceRatio);
    }
    
    if (duration !== undefined) {
      this.recordHistogram("voice.audio.duration", duration);
    }
  }

  /**
   * Track spoofing detection
   */
  trackSpoofingDetection(detected: boolean, type?: string, confidence?: number) {
    this.incrementCounter("voice.security.spoofing.attempts");
    
    if (detected) {
      this.incrementCounter("voice.security.spoofing.blocked");
      
      if (type) {
        this.incrementCounter("voice.security.spoofing.by_type", 1, { type });
      }
    }
    
    if (confidence !== undefined) {
      this.recordHistogram("voice.security.spoofing.confidence", confidence);
    }
  }

  /**
   * Track model inference
   */
  trackModelInference(modelName: string, duration: number, success: boolean) {
    this.incrementCounter(`voice.model.${modelName}.inferences`);
    
    if (success) {
      this.recordHistogram(`voice.model.${modelName}.duration`, duration);
    } else {
      this.incrementCounter(`voice.model.${modelName}.errors`);
    }
  }

  /**
   * Track circuit breaker
   */
  trackCircuitBreaker(serviceName: string, state: string) {
    this.setGauge(`voice.circuit_breaker.${serviceName}.state`, 
      state === "OPEN" ? 1 : 0,
      { service: serviceName, state }
    );
    
    if (state === "OPEN") {
      this.incrementCounter("voice.circuit_breaker.trips", 1, { service: serviceName });
    }
  }

  /**
   * Track retry
   */
  trackRetry(operation: string, attempt: number) {
    this.incrementCounter("voice.retry.attempts", 1, { operation });
    this.recordHistogram("voice.retry.attempt_number", attempt);
  }

  /**
   * Track fallback activation
   */
  trackFallback(component: string, reason: string) {
    this.incrementCounter("voice.fallback.activations", 1, {
      component,
      reason
    });
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): VoiceMetrics {
    return {
      // Authentication
      authAttempts: this.counters.get("voice.auth.attempts.total") || 0,
      authSuccesses: this.counters.get("voice.auth.success") || 0,
      authFailures: this.counters.get("voice.auth.failures") || 0,
      authSuccessRate: this.calculateSuccessRate(
        this.counters.get("voice.auth.success") || 0,
        this.counters.get("voice.auth.attempts.total") || 0
      ),
      avgAuthDuration: this.calculateAverage("voice.auth.duration"),
      
      // Enrollment
      enrollmentStarts: this.counters.get("voice.enrollment.start") || 0,
      enrollmentCompletions: this.counters.get("voice.enrollment.complete") || 0,
      enrollmentFailures: this.counters.get("voice.enrollment.failure") || 0,
      avgSamplesPerEnrollment: this.calculateAverage("voice.enrollment.samples_count"),
      
      // Quality
      avgAudioQuality: this.calculateAverage("voice.enrollment.quality_score"),
      avgSnr: this.calculateAverage("voice.audio.snr"),
      avgConfidenceScore: this.calculateAverage("voice.auth.confidence_score"),
      avgSimilarityScore: this.calculateAverage("voice.auth.similarity_score"),
      
      // Security
      spoofingAttempts: this.counters.get("voice.security.spoofing.attempts") || 0,
      spoofingBlocked: this.counters.get("voice.security.spoofing.blocked") || 0,
      livenessFailures: this.counters.get("voice.security.liveness.failures") || 0,
      replayAttacks: this.counters.get("voice.security.spoofing.by_type:type=replay") || 0,
      syntheticDetections: this.counters.get("voice.security.spoofing.by_type:type=synthetic") || 0,
      deepfakeDetections: this.counters.get("voice.security.spoofing.by_type:type=deepfake") || 0,
      
      // Performance
      avgProcessingTime: this.calculateAverage("voice.processing.duration"),
      avgEmbeddingTime: this.calculateAverage("voice.model.embedding.duration"),
      avgAntiSpoofingTime: this.calculateAverage("voice.model.antiSpoofing.duration"),
      modelInferenceErrors: this.counters.get("voice.model.embedding.errors") || 0,
      
      // System
      circuitBreakerTrips: this.counters.get("voice.circuit_breaker.trips") || 0,
      retryAttempts: this.counters.get("voice.retry.attempts") || 0,
      fallbackActivations: this.counters.get("voice.fallback.activations") || 0,
    };
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];
    
    // Counters
    for (const [key, value] of this.counters.entries()) {
      const { name, tags } = this.parseKey(key);
      const tagsStr = this.formatPrometheusTags(tags);
      lines.push(`${name}${tagsStr} ${value}`);
    }
    
    // Gauges
    for (const [key, value] of this.gauges.entries()) {
      const { name, tags } = this.parseKey(key);
      const tagsStr = this.formatPrometheusTags(tags);
      lines.push(`${name}${tagsStr} ${value}`);
    }
    
    // Histograms (as summaries)
    for (const [key, values] of this.histograms.entries()) {
      const { name, tags } = this.parseKey(key);
      const tagsStr = this.formatPrometheusTags(tags);
      
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;
        
        lines.push(`${name}_sum${tagsStr} ${sum}`);
        lines.push(`${name}_count${tagsStr} ${count}`);
        
        // Percentiles
        lines.push(`${name}{quantile="0.5"${tags ? "," + this.formatPrometheusTags(tags).slice(1, -1) : ""}} ${this.percentile(sorted, 0.5)}`);
        lines.push(`${name}{quantile="0.95"${tags ? "," + this.formatPrometheusTags(tags).slice(1, -1) : ""}} ${this.percentile(sorted, 0.95)}`);
        lines.push(`${name}{quantile="0.99"${tags ? "," + this.formatPrometheusTags(tags).slice(1, -1) : ""}} ${this.percentile(sorted, 0.99)}`);
      }
    }
    
    return lines.join("\n");
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timers.clear();
  }

  /**
   * Helper methods
   */

  private buildKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    
    const tagStr = Object.entries(tags)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    
    return `${name}:${tagStr}`;
  }

  private parseKey(key: string): { name: string; tags?: Record<string, string> } {
    const parts = key.split(":");
    const name = parts[0];
    
    if (parts.length === 1) {
      return { name };
    }
    
    const tags: Record<string, string> = {};
    const tagParts = parts[1].split(",");
    
    for (const tagPart of tagParts) {
      const [k, v] = tagPart.split("=");
      if (k && v) {
        tags[k] = v;
      }
    }
    
    return { name, tags };
  }

  private formatPrometheusTags(tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return "";
    }
    
    const tagStr = Object.entries(tags)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    
    return `{${tagStr}}`;
  }

  private calculateSuccessRate(successes: number, total: number): number {
    return total > 0 ? (successes / total) * 100 : 0;
  }

  private calculateAverage(histogramName: string): number {
    const values = this.histograms.get(histogramName);
    if (!values || values.length === 0) {
      return 0;
    }
    
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, index)];
  }
}

// Singleton instance
let metricsServiceInstance: VoiceMetricsService | null = null;

export function getVoiceMetrics(): VoiceMetricsService {
  if (!metricsServiceInstance) {
    metricsServiceInstance = new VoiceMetricsService();
  }
  return metricsServiceInstance;
}
