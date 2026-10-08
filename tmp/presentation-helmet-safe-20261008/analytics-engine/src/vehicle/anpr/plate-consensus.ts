/**
 * Multi-frame Plate Consensus
 * Combines multiple OCR observations to determine final plate identity
 */

export interface PlateObservation {
  rawText: string;
  normalizedText: string;
  ocrConfidence: number;
  detectionConfidence: number;
  cropQuality: number;
  timestamp: Date;
}

export interface PlateConsensusResult {
  plate: string;
  rawPlate: string;
  confidence: {
    detection: number;
    ocr: number;
    format: number;
    temporalConsensus: number;
    final: number;
  };
  observationCount: number;
  alternatives: Array<{
    plate: string;
    score: number;
    count: number;
  }>;
  status: 'recognized' | 'low-confidence' | 'conflicting' | 'insufficient';
}

export class PlateConsensus {
  constructor(
    private readonly minObservations: number = 2,
    private readonly minConfidence: number = 0.7,
    private readonly editDistanceThreshold: number = 2
  ) {}
  
  /**
   * Resolve consensus plate from multiple observations
   */
  resolve(observations: PlateObservation[]): PlateConsensusResult | null {
    if (observations.length === 0) {
      return null;
    }
    
    if (observations.length < this.minObservations) {
      const best = this.getBestObservation(observations);
      return {
        plate: best.normalizedText,
        rawPlate: best.rawText,
        confidence: {
          detection: best.detectionConfidence,
          ocr: best.ocrConfidence,
          format: 0.5,
          temporalConsensus: 0.3,
          final: this.calculateFinalConfidence(best.detectionConfidence, best.ocrConfidence, 0.5, 0.3),
        },
        observationCount: 1,
        alternatives: [],
        status: 'insufficient',
      };
    }
    
    // Cluster similar plates using edit distance
    const clusters = this.clusterObservations(observations);
    
    // Score each cluster
    const scoredClusters = clusters.map(cluster => ({
      plate: cluster.canonical,
      score: this.scoreCluster(cluster),
      observations: cluster.observations,
      count: cluster.observations.length,
    }));
    
    // Sort by score
    scoredClusters.sort((a, b) => b.score - a.score);
    
    const winner = scoredClusters[0];
    
    // Calculate confidence metrics
    const avgDetectionConfidence = this.average(
      winner.observations.map(o => o.detectionConfidence)
    );
    const avgOcrConfidence = this.average(
      winner.observations.map(o => o.ocrConfidence)
    );
    const avgQuality = this.average(
      winner.observations.map(o => o.cropQuality)
    );
    
    const temporalConsensus = winner.count / observations.length;
    
    const finalConfidence = this.calculateFinalConfidence(
      avgDetectionConfidence,
      avgOcrConfidence,
      avgQuality,
      temporalConsensus
    );
    
    // Determine status
    let status: PlateConsensusResult['status'] = 'recognized';
    if (finalConfidence < this.minConfidence) {
      status = 'low-confidence';
    } else if (scoredClusters.length > 1 && scoredClusters[1].score > winner.score * 0.7) {
      status = 'conflicting';
    }
    
    return {
      plate: winner.plate,
      rawPlate: winner.observations[0].rawText,
      confidence: {
        detection: avgDetectionConfidence,
        ocr: avgOcrConfidence,
        format: avgQuality,
        temporalConsensus,
        final: finalConfidence,
      },
      observationCount: observations.length,
      alternatives: scoredClusters.slice(1, 4).map(c => ({
        plate: c.plate,
        score: c.score,
        count: c.count,
      })),
      status,
    };
  }
  
  /**
   * Cluster observations by edit distance
   */
  private clusterObservations(
    observations: PlateObservation[]
  ): Array<{
    canonical: string;
    observations: PlateObservation[];
  }> {
    const clusters: Array<{
      canonical: string;
      observations: PlateObservation[];
    }> = [];
    
    for (const obs of observations) {
      let assigned = false;
      
      // Try to assign to existing cluster
      for (const cluster of clusters) {
        const distance = this.levenshteinDistance(
          obs.normalizedText,
          cluster.canonical
        );
        
        if (distance <= this.editDistanceThreshold) {
          cluster.observations.push(obs);
          
          // Update canonical if this observation is better
          if (obs.ocrConfidence > cluster.observations[0].ocrConfidence) {
            cluster.canonical = obs.normalizedText;
          }
          
          assigned = true;
          break;
        }
      }
      
      // Create new cluster
      if (!assigned) {
        clusters.push({
          canonical: obs.normalizedText,
          observations: [obs],
        });
      }
    }
    
    return clusters;
  }
  
  /**
   * Score a cluster
   */
  private scoreCluster(cluster: {
    canonical: string;
    observations: PlateObservation[];
  }): number {
    const count = cluster.observations.length;
    const avgConfidence = this.average(
      cluster.observations.map(o => o.ocrConfidence * o.detectionConfidence)
    );
    const avgQuality = this.average(
      cluster.observations.map(o => o.cropQuality)
    );
    
    // Weighted score
    return (
      count * 0.4 +              // Frequency is important
      avgConfidence * 0.4 +      // Confidence matters
      avgQuality * 0.2           // Quality is a tiebreaker
    );
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix: number[][] = [];
    
    // Initialize first column
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    // Initialize first row
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  /**
   * Calculate similarity ratio (0-1)
   */
  private similarityRatio(a: string, b: string): number {
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen > 0 ? 1 - distance / maxLen : 1;
  }
  
  /**
   * Get best single observation
   */
  private getBestObservation(observations: PlateObservation[]): PlateObservation {
    return observations.reduce((best, current) => {
      const currentScore = current.ocrConfidence * 0.5 +
                          current.detectionConfidence * 0.3 +
                          current.cropQuality * 0.2;
      const bestScore = best.ocrConfidence * 0.5 +
                       best.detectionConfidence * 0.3 +
                       best.cropQuality * 0.2;
      return currentScore > bestScore ? current : best;
    });
  }
  
  /**
   * Calculate average of numbers
   */
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }
  
  /**
   * Calculate final composite confidence
   */
  private calculateFinalConfidence(
    detection: number,
    ocr: number,
    format: number,
    temporal: number
  ): number {
    return (
      detection * 0.20 +
      ocr * 0.35 +
      format * 0.15 +
      temporal * 0.30
    );
  }
}

/**
 * Helper to check if consensus is reliable
 */
export function isReliableConsensus(result: PlateConsensusResult): boolean {
  return (
    result.status === 'recognized' &&
    result.confidence.final >= 0.82 &&
    result.observationCount >= 3
  );
}

/**
 * Helper to get confidence level description
 */
export function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.9) return 'very-high';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.7) return 'medium';
  if (confidence >= 0.5) return 'low';
  return 'very-low';
}
