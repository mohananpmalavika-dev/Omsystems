/**
 * License Plate Watchlist Matching Engine
 * 
 * Production-ready matcher supporting exact lookups, wildcard patterns (* and ?),
 * and OCR-confusion-weighted Levenshtein distance fuzzy matching for stolen, wanted,
 * VIP, and security watchlist plates.
 */

import type {
  AnprWatchlistPlateRecord,
  AnprWatchlistRecord,
  WatchlistMatchDetail,
  WatchlistSeverity,
} from './anpr-types.js';

export interface WatchlistRegistryEntry {
  watchlist: AnprWatchlistRecord;
  plate: AnprWatchlistPlateRecord;
}

export class PlateWatchlistMatcher {
  // Frequently confused character pairs in OCR
  private static readonly OCR_CONFUSION_PAIRS: Array<[string, string]> = [
    ['0', 'O'], ['0', 'Q'], ['0', 'D'],
    ['1', 'I'], ['1', 'L'],
    ['2', 'Z'],
    ['5', 'S'],
    ['6', 'G'],
    ['8', 'B'],
  ];

  /**
   * Evaluates a plate against a list of watchlist entries
   */
  public static matchPlate(
    readPlate: string,
    entries: WatchlistRegistryEntry[],
    now: Date = new Date()
  ): WatchlistMatchDetail {
    const normalizedRead = readPlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!normalizedRead || entries.length === 0) {
      return { matched: false };
    }

    let bestMatch: WatchlistMatchDetail | null = null;
    let highestScore = -1;

    for (const entry of entries) {
      const { watchlist, plate } = entry;

      // 1. Skip disabled watchlists or archived records
      if (!watchlist.enabled || watchlist.archived_at || plate.archived_at) {
        continue;
      }

      // 2. Validate time-window constraints (active_from, active_to, expires_at)
      if (plate.expires_at && new Date(plate.expires_at) < now) {
        continue;
      }
      if (plate.active_from && new Date(plate.active_from) > now) {
        continue;
      }
      if (plate.active_to && new Date(plate.active_to) < now) {
        continue;
      }

      const targetPlate = plate.plate_number.toUpperCase();
      const normalizedTarget = plate.normalized_plate || targetPlate.replace(/[^A-Za-z0-9*?]/g, '');

      // Check Match Types:
      // A. Exact Match
      if (normalizedRead === normalizedTarget) {
        const severity = this.resolveSeverity(watchlist, plate);
        return {
          matched: true,
          watchlistId: watchlist.id,
          watchlistName: watchlist.name,
          listType: watchlist.list_type,
          plateId: plate.id,
          targetPlate: plate.plate_number,
          reason: plate.reason,
          severity,
          alertAuthorities: watchlist.alert_authorities,
          matchType: 'exact',
          editDistance: 0,
          similarity: 1.0,
        };
      }

      // B. Wildcard Match (* or ?)
      if (normalizedTarget.includes('*') || normalizedTarget.includes('?')) {
        const regexPattern = new RegExp(
          `^${normalizedTarget.replace(/[-[\]{}()+.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`
        );
        if (regexPattern.test(normalizedRead)) {
          const score = 0.95;
          if (score > highestScore) {
            highestScore = score;
            bestMatch = {
              matched: true,
              watchlistId: watchlist.id,
              watchlistName: watchlist.name,
              listType: watchlist.list_type,
              plateId: plate.id,
              targetPlate: plate.plate_number,
              reason: plate.reason,
              severity: this.resolveSeverity(watchlist, plate),
              alertAuthorities: watchlist.alert_authorities,
              matchType: 'wildcard',
              editDistance: 0,
              similarity: score,
            };
          }
        }
      }

      // C. Fuzzy Levenshtein Distance (if enabled for this plate entry)
      if (plate.fuzzy_match) {
        const maxAllowedDistance = plate.max_levenshtein_distance ?? 1;
        const weightedDist = this.computeWeightedDistance(normalizedRead, normalizedTarget);

        if (weightedDist <= maxAllowedDistance) {
          const maxLength = Math.max(normalizedRead.length, normalizedTarget.length);
          const similarity = Math.max(0, 1.0 - (weightedDist / maxLength));

          if (similarity > highestScore) {
            highestScore = similarity;
            bestMatch = {
              matched: true,
              watchlistId: watchlist.id,
              watchlistName: watchlist.name,
              listType: watchlist.list_type,
              plateId: plate.id,
              targetPlate: plate.plate_number,
              reason: plate.reason,
              severity: this.resolveSeverity(watchlist, plate),
              alertAuthorities: watchlist.alert_authorities,
              matchType: 'fuzzy',
              editDistance: Math.round(weightedDist),
              similarity,
            };
          }
        }
      }
    }

    return bestMatch || { matched: false };
  }

  /**
   * Computes OCR-confusion-weighted Levenshtein edit distance
   * Substitutions between easily confused optical pairs (e.g., 0/O, 8/B) are penalized at 0.5 cost
   * instead of standard 1.0.
   */
  public static computeWeightedDistance(source: string, target: string): number {
    const sLen = source.length;
    const tLen = target.length;

    if (sLen === 0) return tLen;
    if (tLen === 0) return sLen;

    const stride = tLen + 1;
    const dp = new Float32Array((sLen + 1) * stride);

    for (let i = 0; i <= sLen; i++) dp[i * stride] = i;
    for (let j = 0; j <= tLen; j++) dp[j] = j;

    for (let i = 1; i <= sLen; i++) {
      const sChar = source.charAt(i - 1);
      const rowIdx = i * stride;
      const prevRowIdx = (i - 1) * stride;

      for (let j = 1; j <= tLen; j++) {
        const tChar = target.charAt(j - 1);

        if (sChar === tChar) {
          dp[rowIdx + j] = dp[prevRowIdx + (j - 1)] ?? 0;
        } else {
          const subCost = this.isOcrConfusionPair(sChar, tChar) ? 0.5 : 1.0;
          const delCost = (dp[prevRowIdx + j] ?? 0) + 1;
          const insCost = (dp[rowIdx + (j - 1)] ?? 0) + 1;
          const subTotal = (dp[prevRowIdx + (j - 1)] ?? 0) + subCost;
          dp[rowIdx + j] = Math.min(delCost, insCost, subTotal);
        }
      }
    }

    return dp[sLen * stride + tLen] ?? sLen;
  }

  /**
   * Checks if two characters are commonly confused during OCR
   */
  private static isOcrConfusionPair(c1: string, c2: string): boolean {
    return this.OCR_CONFUSION_PAIRS.some(
      ([a, b]) => (a === c1 && b === c2) || (a === c2 && b === c1)
    );
  }

  /**
   * Determines operational alert severity
   */
  private static resolveSeverity(
    watchlist: AnprWatchlistRecord,
    plate: AnprWatchlistPlateRecord
  ): WatchlistSeverity {
    if (watchlist.list_type === 'stolen' || watchlist.list_type === 'wanted' || watchlist.list_type === 'blacklist') {
      return 'P1';
    }
    if (plate.priority === 'critical') return 'P1';
    if (plate.priority === 'high') return 'P2';
    return watchlist.alert_severity || 'P2';
  }
}
