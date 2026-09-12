/**
 * License Plate Syntax Normalizer & OCR Error Corrector
 * 
 * Implements syntax grammar validation, state code verification,
 * optical bounding box aspect ratio checking, and position-aware
 * OCR confusion matrix character correction (0/O, 1/I, 8/B, 5/S, 2/Z).
 */

import type {
  BoundingBox,
  CharacterReading,
  PlateReading,
  PlateType,
} from './anpr-types.js';

export interface SyntaxRule {
  name: string;
  countryCode: string;
  pattern: RegExp;
  plateType: PlateType;
  /** Template string with 'L' for Letter and 'D' for Digit to guide positional correction */
  positionTemplate?: string;
  description: string;
}

export class PlateSyntaxNormalizer {
  // Official Indian State and Union Territory codes (36 active jurisdictions)
  public static readonly INDIAN_STATE_CODES = new Set([
    'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN',
    'GA', 'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD',
    'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ',
    'SK', 'TN', 'TR', 'TS', 'UK', 'UP', 'WB',
  ]);

  // Positional OCR Confusion Maps
  private static readonly DIGIT_TO_LETTER: Record<string, string> = {
    '0': 'O',
    '1': 'I',
    '2': 'Z',
    '5': 'S',
    '6': 'G',
    '8': 'B',
  };

  private static readonly LETTER_TO_DIGIT: Record<string, string> = {
    'O': '0',
    'Q': '0',
    'D': '0',
    'I': '1',
    'L': '1',
    'Z': '2',
    'S': '5',
    'G': '6',
    'B': '8',
  };

  // Supported National and Series Syntax Rules
  public static readonly SYNTAX_RULES: SyntaxRule[] = [
    {
      name: 'IN_STANDARD_SERIES',
      countryCode: 'IN',
      // e.g. DL01CA1234, MH12AB1234, KA04ME5678, KL01C1234
      pattern: /^([A-Z]{2})([0-9]{2})([A-Z]{1,3})([0-9]{4})$/,
      plateType: 'standard',
      positionTemplate: 'LLDDLLLDDDD',
      description: 'Indian Standard Vehicle Registration (State + District + Series + 4 Digits)',
    },
    {
      name: 'IN_BHARAT_SERIES',
      countryCode: 'IN',
      // e.g. 21BH1234AA, 22BH9999Z, 24BH1234AB
      pattern: /^([0-9]{2})BH([0-9]{4})([A-Z]{1,2})$/,
      plateType: 'standard',
      positionTemplate: 'DDBHDDDDLL',
      description: 'Indian Pan-India Bharat (BH) Central Registration Series',
    },
    {
      name: 'IN_VINTAGE_SERIES',
      countryCode: 'IN',
      // e.g. DL011234
      pattern: /^([A-Z]{2})([0-9]{2})([0-9]{4})$/,
      plateType: 'standard',
      positionTemplate: 'LLDDDDDD',
      description: 'Indian Legacy 8-Character Registration Format',
    },
    {
      name: 'IN_COMMERCIAL_SERIES',
      countryCode: 'IN',
      // e.g. DL1T1234, KA01T9999
      pattern: /^([A-Z]{2})([0-9]{1,2})([A-Z]{1,2})([0-9]{4})$/,
      plateType: 'commercial',
      description: 'Indian Commercial Taxi/Carrier Series',
    },
    {
      name: 'UK_STANDARD_SERIES',
      countryCode: 'GB',
      // e.g. AB12CDE
      pattern: /^([A-Z]{2})([0-9]{2})([A-Z]{3})$/,
      plateType: 'standard',
      positionTemplate: 'LLDDLLL',
      description: 'United Kingdom Standard Registration (Age Identifier)',
    },
    {
      name: 'US_STANDARD_SERIES',
      countryCode: 'US',
      // e.g. 7XYZ123, 1ABC234, ABC1234
      pattern: /^([0-9A-Z]{5,8})$/,
      plateType: 'standard',
      description: 'US State Alphanumeric Plate Format',
    },
  ];

  /**
   * Cleans and normalizes plate text (removes non-alphanumeric, strips whitespace, converts uppercase)
   */
  public static normalizePlateText(rawText: string): string {
    if (!rawText) return '';
    return rawText.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  /**
   * Validates if optical plate bounding box satisfies standard license plate aspect ratio
   * Standard vehicle plates typically have aspect ratios (width/height) from 2.0 to 5.5.
   */
  public static validatePlateGeometry(bbox: BoundingBox): {
    isValidGeometry: boolean;
    aspectRatio: number;
    reason?: string;
  } {
    if (bbox.width <= 0 || bbox.height <= 0) {
      return { isValidGeometry: false, aspectRatio: 0, reason: 'Invalid bounding box dimensions' };
    }

    const aspectRatio = bbox.width / bbox.height;

    if (aspectRatio < 1.4) {
      return {
        isValidGeometry: false,
        aspectRatio,
        reason: `Aspect ratio ${aspectRatio.toFixed(2)} too tall/square for license plate (min 1.4)`,
      };
    }

    if (aspectRatio > 7.0) {
      return {
        isValidGeometry: false,
        aspectRatio,
        reason: `Aspect ratio ${aspectRatio.toFixed(2)} too narrow/elongated (max 7.0)`,
      };
    }

    return { isValidGeometry: true, aspectRatio };
  }

  /**
   * Inspects and normalizes raw OCR reading, applying positional grammar corrections
   * and matching against known registration syntax rules.
   */
  public static processPlateText(
    rawText: string,
    countryPreference: string = 'IN',
    characters: CharacterReading[] = []
  ): {
    plateNumber: string;
    normalizedPlate: string;
    isValidSyntax: boolean;
    countryCode: string;
    regionCode?: string;
    plateType: PlateType;
    syntaxFormatName?: string;
    correctionsApplied: number;
    correctedCharacters: CharacterReading[];
  } {
    const rawClean = this.normalizePlateText(rawText);
    if (!rawClean) {
      return {
        plateNumber: '',
        normalizedPlate: '',
        isValidSyntax: false,
        countryCode: countryPreference,
        plateType: 'standard',
        correctionsApplied: 0,
        correctedCharacters: [],
      };
    }

    // 1. First check if rawClean already matches an official syntax rule without edits
    const directMatch = this.matchSyntaxRule(rawClean, countryPreference);
    if (directMatch) {
      return {
        plateNumber: rawClean,
        normalizedPlate: rawClean,
        isValidSyntax: true,
        countryCode: directMatch.rule.countryCode,
        regionCode: directMatch.regionCode,
        plateType: directMatch.rule.plateType,
        syntaxFormatName: directMatch.rule.name,
        correctionsApplied: 0,
        correctedCharacters: characters.length > 0 ? characters : this.splitToCharacters(rawClean),
      };
    }

    // 2. If no direct match, attempt positional OCR confusion matrix repair
    const repairResult = this.attemptPositionalCorrection(rawClean, countryPreference, characters);
    if (repairResult) {
      return repairResult;
    }

    // 3. Fallback: uncorrected valid alphanumeric string
    return {
      plateNumber: rawClean,
      normalizedPlate: rawClean,
      isValidSyntax: false,
      countryCode: countryPreference,
      plateType: 'standard',
      syntaxFormatName: 'GENERIC_ALPHANUMERIC',
      correctionsApplied: 0,
      correctedCharacters: characters.length > 0 ? characters : this.splitToCharacters(rawClean),
    };
  }

  /**
   * Matches string against known syntax rules, enforcing state code check for India
   */
  private static matchSyntaxRule(
    plate: string,
    preferredCountry: string
  ): { rule: SyntaxRule; regionCode?: string } | null {
    // Sort rules to prefer the targeted country
    const rules = [...this.SYNTAX_RULES].sort((a, b) => {
      if (a.countryCode === preferredCountry && b.countryCode !== preferredCountry) return -1;
      if (b.countryCode === preferredCountry && a.countryCode !== preferredCountry) return 1;
      return 0;
    });

    for (const rule of rules) {
      const match = rule.pattern.exec(plate);
      if (match) {
        if (rule.countryCode === 'IN') {
          // Verify state code
          if (rule.name === 'IN_BHARAT_SERIES') {
            return { rule, regionCode: 'BH' };
          }
          const stateCode = match[1] ?? '';
          if (this.INDIAN_STATE_CODES.has(stateCode)) {
            return { rule, regionCode: stateCode };
          }
          // If 2 letters not in known state codes, standard Indian rule doesn't fully validate
          continue;
        }
        return { rule, regionCode: match[1] };
      }
    }

    return null;
  }

  /**
   * Attempts intelligent positional OCR character repair based on target grammar
   */
  private static attemptPositionalCorrection(
    plate: string,
    preferredCountry: string,
    originalChars: CharacterReading[]
  ): {
    plateNumber: string;
    normalizedPlate: string;
    isValidSyntax: boolean;
    countryCode: string;
    regionCode?: string;
    plateType: PlateType;
    syntaxFormatName?: string;
    correctionsApplied: number;
    correctedCharacters: CharacterReading[];
  } | null {
    // 1. Try Indian Standard Series (9 to 11 characters, e.g. DL01CA1234 or DLO1CA1234)
    // Structure: [2 State Letters] [2 District Digits] [1-3 Series Letters] [4 Unique Digits]
    if (preferredCountry === 'IN' && plate.length >= 9 && plate.length <= 11) {
      const candidateChars = plate.split('');
      let corrections = 0;

      // Positions 0 & 1 must be Letters
      for (let i = 0; i < 2; i++) {
        const c = candidateChars[i];
        const mapped = c ? this.DIGIT_TO_LETTER[c] : undefined;
        if (mapped !== undefined) {
          candidateChars[i] = mapped;
          corrections++;
        }
      }

      // Positions 2 & 3 must be Digits
      for (let i = 2; i < 4; i++) {
        const c = candidateChars[i];
        const mapped = c ? this.LETTER_TO_DIGIT[c] : undefined;
        if (mapped !== undefined) {
          candidateChars[i] = mapped;
          corrections++;
        }
      }

      // Last 4 characters must be Digits
      const lastFourStart = candidateChars.length - 4;
      for (let i = lastFourStart; i < candidateChars.length; i++) {
        const c = candidateChars[i];
        const mapped = c ? this.LETTER_TO_DIGIT[c] : undefined;
        if (mapped !== undefined) {
          candidateChars[i] = mapped;
          corrections++;
        }
      }

      // Characters between index 4 and lastFourStart must be Letters
      for (let i = 4; i < lastFourStart; i++) {
        const c = candidateChars[i];
        const mapped = c ? this.DIGIT_TO_LETTER[c] : undefined;
        if (mapped !== undefined) {
          candidateChars[i] = mapped;
          corrections++;
        }
      }

      const corrected = candidateChars.join('');
      const match = this.matchSyntaxRule(corrected, 'IN');
      if (match) {
        return {
          plateNumber: corrected,
          normalizedPlate: corrected,
          isValidSyntax: true,
          countryCode: match.rule.countryCode,
          regionCode: match.regionCode,
          plateType: match.rule.plateType,
          syntaxFormatName: match.rule.name,
          correctionsApplied: corrections,
          correctedCharacters: this.applyCorrectionsToCharacters(originalChars, candidateChars),
        };
      }
    }

    // 2. Try Bharat Series (10 chars, e.g. 22BH1234AB)
    // Structure: [2 Digits] [BH] [4 Digits] [1-2 Letters]
    if (preferredCountry === 'IN' && (plate.length === 9 || plate.length === 10)) {
      const candidateChars = plate.split('');
      let corrections = 0;

      // Positions 0 & 1 must be Digits
      for (let i = 0; i < 2; i++) {
        const c = candidateChars[i];
        const mapped = c ? this.LETTER_TO_DIGIT[c] : undefined;
        if (mapped !== undefined) {
          candidateChars[i] = mapped;
          corrections++;
        }
      }

      // Positions 2 & 3 must be 'BH'
      if (candidateChars[2] === '8' || candidateChars[2] === 'B') {
        if (candidateChars[2] === '8') corrections++;
        candidateChars[2] = 'B';
      }
      if (candidateChars[3] === 'H' || candidateChars[3] === '4') {
        if (candidateChars[3] === '4') corrections++;
        candidateChars[3] = 'H';
      }

      // Positions 4, 5, 6, 7 must be Digits
      for (let i = 4; i <= 7; i++) {
        const c = candidateChars[i];
        const mapped = c ? this.LETTER_TO_DIGIT[c] : undefined;
        if (mapped !== undefined) {
          candidateChars[i] = mapped;
          corrections++;
        }
      }

      // Positions 8+ must be Letters
      for (let i = 8; i < candidateChars.length; i++) {
        const c = candidateChars[i];
        const mapped = c ? this.DIGIT_TO_LETTER[c] : undefined;
        if (mapped !== undefined) {
          candidateChars[i] = mapped;
          corrections++;
        }
      }

      const corrected = candidateChars.join('');
      const match = this.matchSyntaxRule(corrected, 'IN');
      if (match && match.rule.name === 'IN_BHARAT_SERIES') {
        return {
          plateNumber: corrected,
          normalizedPlate: corrected,
          isValidSyntax: true,
          countryCode: match.rule.countryCode,
          regionCode: match.regionCode,
          plateType: match.rule.plateType,
          syntaxFormatName: match.rule.name,
          correctionsApplied: corrections,
          correctedCharacters: this.applyCorrectionsToCharacters(originalChars, candidateChars),
        };
      }
    }

    return null;
  }

  private static splitToCharacters(text: string): CharacterReading[] {
    const charWidth = text.length > 0 ? 1 / text.length : 1;
    return text.split('').map((char, index) => ({
      char,
      confidence: 0.95,
      bbox: { x: index * charWidth, y: 0, width: charWidth, height: 1 },
    }));
  }

  private static applyCorrectionsToCharacters(
    original: CharacterReading[],
    correctedChars: string[]
  ): CharacterReading[] {
    if (original.length === correctedChars.length) {
      return original.map((reading, i) => ({
        ...reading,
        char: correctedChars[i] ?? reading.char,
      }));
    }
    return this.splitToCharacters(correctedChars.join(''));
  }
}
