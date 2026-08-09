import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { IncidentData, RootCauseAnalysis } from '../types';

export class RootCauseAnalyzer {
  private openai: OpenAI;
  private analysisCache: Map<string, RootCauseAnalysis>;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.analysisCache = new Map();
  }

  async analyze(incidentId: string, incidentData: IncidentData): Promise<RootCauseAnalysis> {
    try {
      logger.info(`Starting root cause analysis for incident ${incidentId}`);

      // Build context from incident data
      const context = this.buildContext(incidentData);

      // Call OpenAI for analysis
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert security analyst specializing in root cause analysis for security incidents. 
Analyze the provided incident data and identify:
1. The root cause of the incident
2. Contributing factors
3. Recommended remediation steps
4. Preventive measures for the future

Provide structured, actionable insights.`
          },
          {
            role: 'user',
            content: context
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const aiAnalysis = completion.choices[0]?.message?.content || '';

      // Parse AI response and structure the analysis
      const analysis: RootCauseAnalysis = {
        incidentId,
        timestamp: new Date().toISOString(),
        rootCause: this.extractRootCause(aiAnalysis),
        contributingFactors: this.extractContributingFactors(aiAnalysis),
        remediationSteps: this.extractRemediationSteps(aiAnalysis),
        preventiveMeasures: this.extractPreventiveMeasures(aiAnalysis),
        confidence: this.calculateConfidence(incidentData),
        rawAnalysis: aiAnalysis
      };

      // Cache the analysis
      this.analysisCache.set(incidentId, analysis);

      logger.info(`Root cause analysis completed for incident ${incidentId}`);
      return analysis;
    } catch (error: any) {
      logger.error(`Root cause analysis failed for incident ${incidentId}:`, error);
      throw new Error(`Analysis failed: ${error.message}`);
    }
  }

  async getAnalysis(incidentId: string): Promise<RootCauseAnalysis | null> {
    return this.analysisCache.get(incidentId) || null;
  }

  private buildContext(incidentData: IncidentData): string {
    const parts: string[] = [];

    parts.push(`Incident Type: ${incidentData.type}`);
    parts.push(`Severity: ${incidentData.severity}`);
    parts.push(`Description: ${incidentData.description}`);
    
    if (incidentData.cameraId) {
      parts.push(`Camera ID: ${incidentData.cameraId}`);
    }
    
    if (incidentData.location) {
      parts.push(`Location: ${incidentData.location}`);
    }

    if (incidentData.metadata) {
      parts.push(`Additional Metadata: ${JSON.stringify(incidentData.metadata, null, 2)}`);
    }

    if (incidentData.relatedIncidents && incidentData.relatedIncidents.length > 0) {
      parts.push(`Related Incidents: ${incidentData.relatedIncidents.join(', ')}`);
    }

    if (incidentData.systemLogs && incidentData.systemLogs.length > 0) {
      parts.push(`System Logs:\n${incidentData.systemLogs.join('\n')}`);
    }

    return parts.join('\n\n');
  }

  private extractRootCause(analysis: string): string {
    // Simple extraction - in production, use more sophisticated parsing
    const match = analysis.match(/root cause[:\s]+([^\n]+)/i);
    return match ? match[1].trim() : 'Unable to determine root cause';
  }

  private extractContributingFactors(analysis: string): string[] {
    // Extract bullet points or numbered items related to contributing factors
    const factors: string[] = [];
    const lines = analysis.split('\n');
    
    let inFactorsSection = false;
    for (const line of lines) {
      if (/contributing factors?/i.test(line)) {
        inFactorsSection = true;
        continue;
      }
      if (inFactorsSection && /^[\d-•*]/.test(line.trim())) {
        factors.push(line.trim().replace(/^[\d-•*.\s]+/, ''));
      }
      if (inFactorsSection && /^[A-Z][^:]+:/.test(line)) {
        inFactorsSection = false;
      }
    }
    
    return factors.length > 0 ? factors : ['No specific contributing factors identified'];
  }

  private extractRemediationSteps(analysis: string): string[] {
    const steps: string[] = [];
    const lines = analysis.split('\n');
    
    let inStepsSection = false;
    for (const line of lines) {
      if (/remed(i|y)ation|recommended steps|action items/i.test(line)) {
        inStepsSection = true;
        continue;
      }
      if (inStepsSection && /^[\d-•*]/.test(line.trim())) {
        steps.push(line.trim().replace(/^[\d-•*.\s]+/, ''));
      }
      if (inStepsSection && /^[A-Z][^:]+:/.test(line) && !/remed/i.test(line)) {
        inStepsSection = false;
      }
    }
    
    return steps.length > 0 ? steps : ['Review incident details and take appropriate action'];
  }

  private extractPreventiveMeasures(analysis: string): string[] {
    const measures: string[] = [];
    const lines = analysis.split('\n');
    
    let inMeasuresSection = false;
    for (const line of lines) {
      if (/prevent(ive|ion)|future measures/i.test(line)) {
        inMeasuresSection = true;
        continue;
      }
      if (inMeasuresSection && /^[\d-•*]/.test(line.trim())) {
        measures.push(line.trim().replace(/^[\d-•*.\s]+/, ''));
      }
      if (inMeasuresSection && /^[A-Z][^:]+:/.test(line) && !/prevent/i.test(line)) {
        inMeasuresSection = false;
      }
    }
    
    return measures.length > 0 ? measures : ['Implement monitoring and alerting for similar incidents'];
  }

  private calculateConfidence(incidentData: IncidentData): number {
    // Start from 0 and build confidence based on actual data quality
    let confidence = 0;

    // Minimum baseline only if we have basic description
    if (incidentData.description && incidentData.description.length > 20) {
      confidence = 0.2; // Minimal baseline for having incident data
    }

    // Increase confidence based on data completeness
    if (incidentData.description && incidentData.description.length > 50) {
      confidence += 0.1;
    }
    
    if (incidentData.metadata && Object.keys(incidentData.metadata).length > 0) {
      confidence += 0.1;
    }
    
    if (incidentData.systemLogs && incidentData.systemLogs.length > 0) {
      confidence += 0.15;
    }
    
    if (incidentData.relatedIncidents && incidentData.relatedIncidents.length > 0) {
      confidence += 0.15;
    }

    return Math.min(confidence, 1.0);
  }
}
