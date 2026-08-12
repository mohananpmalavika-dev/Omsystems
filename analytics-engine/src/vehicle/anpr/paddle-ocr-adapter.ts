/**
 * PaddleOCR Adapter
 * Integrates with PaddleOCR for license plate text recognition
 */

import type { ImageMatrix } from '../color/vehicle-color-classifier.js';

export interface OcrRecognition {
  text: string;
  confidence: number;
  characterConfidences: number[];
  characters: Array<{
    char: string;
    confidence: number;
  }>;
}

export interface PlateRecognizer {
  recognize(plate: ImageMatrix): Promise<OcrRecognition[]>;
}

/**
 * PaddleOCR-based Plate Recognizer
 */
export class PaddlePlateRecognizer implements PlateRecognizer {
  private serviceUrl: string;
  private timeout: number;
  
  constructor(
    serviceUrl: string = process.env.PADDLE_OCR_URL || 'http://localhost:8000',
    timeout: number = 5000
  ) {
    this.serviceUrl = serviceUrl;
    this.timeout = timeout;
  }
  
  async recognize(image: ImageMatrix): Promise<OcrRecognition[]> {
    try {
      // Preprocess image for OCR
      const prepared = this.preprocess(image);
      
      // Call PaddleOCR service
      const response = await this.callOcrService(prepared);
      
      // Parse response
      return this.parseOcrResponse(response);
    } catch (error) {
      console.warn('PaddleOCR recognition failed:', error);
      return [];
    }
  }
  
  /**
   * Preprocess image for OCR
   */
  private preprocess(image: ImageMatrix): Buffer {
    // Convert to grayscale if not already
    const gray = new Uint8Array(image.width * image.height);
    
    for (let i = 0, j = 0; i < image.data.length; i += image.channels, j++) {
      gray[j] = Math.round(
        0.299 * image.data[i] +
        0.587 * image.data[i + 1] +
        0.114 * image.data[i + 2]
      );
    }
    
    // Encode as PNG or JPEG
    // In production, use a proper image encoding library
    return Buffer.from(gray);
  }
  
  /**
   * Call OCR service
   */
  private async callOcrService(imageBuffer: Buffer): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      // Convert Buffer to Uint8Array for fetch body compatibility
      const uint8Array = new Uint8Array(imageBuffer);
      
      const response = await fetch(`${this.serviceUrl}/ocr/recognize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: uint8Array,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`OCR service returned ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  /**
   * Parse OCR service response
   */
  private parseOcrResponse(response: any): OcrRecognition[] {
    if (!response || !response.results || !Array.isArray(response.results)) {
      return [];
    }
    
    return response.results.map((result: any) => {
      const text = result.text || '';
      const confidence = result.confidence || 0;
      
      // Parse character-level confidences if available
      const characters = result.characters || [];
      const characterConfidences = characters.map((c: any) => c.confidence || 0);
      
      return {
        text: text.trim(),
        confidence,
        characterConfidences,
        characters: characters.map((c: any) => ({
          char: c.char || '',
          confidence: c.confidence || 0,
        })),
      };
    });
  }
  
  /**
   * Check if service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serviceUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Mock OCR recognizer for testing
 */
export class MockPlateRecognizer implements PlateRecognizer {
  async recognize(image: ImageMatrix): Promise<OcrRecognition[]> {
    // Generate mock plate number for testing
    const mockPlates = [
      'KL01AB1234',
      'DL01CA5678',
      'MH02XY9876',
      'TN03BC4567',
    ];
    
    const text = mockPlates[Math.floor(Math.random() * mockPlates.length)];
    const confidence = 0.85 + Math.random() * 0.1;
    
    return [{
      text,
      confidence,
      characterConfidences: text.split('').map(() => 0.8 + Math.random() * 0.15),
      characters: text.split('').map(char => ({
        char,
        confidence: 0.8 + Math.random() * 0.15,
      })),
    }];
  }
}
