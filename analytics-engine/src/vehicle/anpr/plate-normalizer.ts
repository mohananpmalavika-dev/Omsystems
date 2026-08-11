/**
 * License Plate Normalization
 * Country-aware plate format validation and OCR error correction
 */

export interface PlateFormat {
  country: string;
  patterns: RegExp[];
  expectedPositions: Array<'letter' | 'digit' | 'either'>;
  exampleFormat: string;
}

export interface NormalizedPlate {
  text: string;
  confidence: number;
  format: string;
  country: string;
  changes: Array<{
    position: number;
    from: string;
    to: string;
    reason: string;
  }>;
}

export class PlateNormalizer {
  private formats: Map<string, PlateFormat> = new Map();
  
  constructor() {
    this.initializeFormats();
  }
  
  /**
   * Normalize plate text based on country format
   */
  normalize(rawText: string, countryHint?: string): NormalizedPlate {
    // Step 1: Basic normalization
    let normalized = rawText
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    
    const changes: Array<{ position: number; from: string; to: string; reason: string }> = [];
    
    // Step 2: Try to match against known formats
    const format = this.detectFormat(normalized, countryHint);
    
    if (format) {
      // Step 3: Apply format-based corrections
      const corrected = this.applyFormatCorrections(normalized, format, changes);
      
      // Step 4: Validate corrected format
      const isValid = format.patterns.some(pattern => pattern.test(corrected));
      
      return {
        text: corrected,
        confidence: this.calculateNormalizationConfidence(changes, isValid),
        format: format.exampleFormat,
        country: format.country,
        changes,
      };
    }
    
    // No format matched - return basic normalization
    return {
      text: normalized,
      confidence: 0.5,
      format: 'UNKNOWN',
      country: countryHint || 'UNKNOWN',
      changes,
    };
  }
  
  /**
   * Detect plate format from text
   */
  private detectFormat(text: string, countryHint?: string): PlateFormat | null {
    // Try country hint first
    if (countryHint) {
      const format = this.formats.get(countryHint);
      if (format && this.matchesFormatLength(text, format)) {
        return format;
      }
    }
    
    // Try all formats
    for (const format of this.formats.values()) {
      if (this.matchesFormatLength(text, format)) {
        // Check if it loosely matches the pattern
        const score = this.calculateFormatMatchScore(text, format);
        if (score > 0.6) {
          return format;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Check if text length matches format
   */
  private matchesFormatLength(text: string, format: PlateFormat): boolean {
    const expectedLength = format.expectedPositions.length;
    return Math.abs(text.length - expectedLength) <= 1;
  }
  
  /**
   * Calculate how well text matches format
   */
  private calculateFormatMatchScore(text: string, format: PlateFormat): number {
    let matches = 0;
    const len = Math.min(text.length, format.expectedPositions.length);
    
    for (let i = 0; i < len; i++) {
      const char = text[i];
      const expected = format.expectedPositions[i];
      
      if (expected === 'either') {
        matches++;
      } else if (expected === 'letter' && /[A-Z]/.test(char)) {
        matches++;
      } else if (expected === 'digit' && /[0-9]/.test(char)) {
        matches++;
      }
    }
    
    return len > 0 ? matches / len : 0;
  }
  
  /**
   * Apply format-based character corrections
   */
  private applyFormatCorrections(
    text: string,
    format: PlateFormat,
    changes: Array<{ position: number; from: string; to: string; reason: string }>
  ): string {
    const chars = text.split('');
    
    for (let i = 0; i < chars.length && i < format.expectedPositions.length; i++) {
      const char = chars[i];
      const expected = format.expectedPositions[i];
      
      if (expected === 'letter' && /[0-9]/.test(char)) {
        const corrected = this.digitToLetter(char);
        if (corrected !== char) {
          changes.push({
            position: i,
            from: char,
            to: corrected,
            reason: 'expected-letter',
          });
          chars[i] = corrected;
        }
      } else if (expected === 'digit' && /[A-Z]/.test(char)) {
        const corrected = this.letterToDigit(char);
        if (corrected !== char) {
          changes.push({
            position: i,
            from: char,
            to: corrected,
            reason: 'expected-digit',
          });
          chars[i] = corrected;
        }
      }
    }
    
    return chars.join('');
  }
  
  /**
   * Correct digit to similar letter
   */
  private digitToLetter(digit: string): string {
    const map: Record<string, string> = {
      '0': 'O',
      '1': 'I',
      '2': 'Z',
      '3': 'Z', // Rare
      '5': 'S',
      '6': 'G',
      '8': 'B',
    };
    return map[digit] || digit;
  }
  
  /**
   * Correct letter to similar digit
   */
  private letterToDigit(letter: string): string {
    const map: Record<string, string> = {
      'O': '0',
      'I': '1',
      'L': '1',
      'Z': '2',
      'S': '5',
      'G': '6',
      'B': '8',
      'D': '0', // Context-dependent
      'Q': '0',
    };
    return map[letter] || letter;
  }
  
  /**
   * Calculate normalization confidence
   */
  private calculateNormalizationConfidence(
    changes: Array<{ position: number; from: string; to: string; reason: string }>,
    isValid: boolean
  ): number {
    if (!isValid) return 0.3;
    if (changes.length === 0) return 1.0;
    if (changes.length > 3) return 0.5;
    
    // Penalty based on number of changes
    return Math.max(0.7, 1.0 - changes.length * 0.1);
  }
  
  /**
   * Initialize plate formats for different countries
   */
  private initializeFormats(): void {
    // India formats
    this.formats.set('IN', {
      country: 'IN',
      patterns: [
        /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/,  // DL01CA1234, DL01C1234
        /^[A-Z]{2}[0-9]{2}[0-9]{4}$/,            // DL011234 (old)
        /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/,        // 22BH1234AB (Bharat)
      ],
      expectedPositions: [
        'letter', 'letter',         // State code: DL
        'digit', 'digit',           // RTO code: 01
        'letter',                   // Series: C or CA
        'digit', 'digit', 'digit', 'digit', // Number: 1234
      ],
      exampleFormat: 'DL01CA1234',
    });
    
    // India - 10 character format
    this.formats.set('IN-10', {
      country: 'IN',
      patterns: [
        /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/,
      ],
      expectedPositions: [
        'letter', 'letter',
        'digit', 'digit',
        'letter', 'letter',
        'digit', 'digit', 'digit', 'digit',
      ],
      exampleFormat: 'DL01CA1234',
    });
    
    // USA format (example)
    this.formats.set('US', {
      country: 'US',
      patterns: [
        /^[A-Z0-9]{6,8}$/,
      ],
      expectedPositions: [
        'either', 'either', 'either', 'either', 'either', 'either',
      ],
      exampleFormat: 'ABC123',
    });
    
    // UK format
    this.formats.set('UK', {
      country: 'UK',
      patterns: [
        /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/,  // AB12CDE
      ],
      expectedPositions: [
        'letter', 'letter',
        'digit', 'digit',
        'letter', 'letter', 'letter',
      ],
      exampleFormat: 'AB12CDE',
    });
  }
  
  /**
   * Validate plate format
   */
  isValid(text: string, country?: string): boolean {
    const format = this.detectFormat(text, country);
    if (!format) return false;
    
    return format.patterns.some(pattern => pattern.test(text));
  }
  
  /**
   * Get expected format for country
   */
  getFormat(country: string): PlateFormat | undefined {
    return this.formats.get(country);
  }
}
