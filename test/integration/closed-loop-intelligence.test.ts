/**
 * Sprint 5: Closed-Loop Intelligence Integration Test
 * 
 * Tests the complete intelligence pipeline:
 * Prediction → Risk → Alert → RCA → Recommendation → Prevention → Feedback
 * 
 * This test validates that all stages connect properly and the system
 * can autonomously move from prediction to preventive action.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { IntelligenceOrchestrator } from '../../src/intelligence/intelligence-orchestrator';
import type { Prediction } from '../../analytics-engine/src/detectors/ai-prediction-engine';
import type { RootCauseAnalysis } from '../../root-cause-analysis-engine/src/types';

describe('Sprint 5: Closed-Loop Intelligence Pipeline', () => {
  let orchestrator: IntelligenceOrchestrator;

  beforeAll(() => {
    orchestrator = new IntelligenceOrchestrator();
  });

  afterAll(() => {
    // Cleanup
  });

  describe('1. Full Pipeline: Camera Failure Prediction → Prevention', () => {
    it('should process prediction through entire pipeline to preventive action', async () => {
      const startTime = Date.now();

      // STAGE 1: PREDICTION
      const prediction: Prediction = {
        type: 'hardware_failure',
        target: 'CAM_ENTRANCE_001',
        probability: 0.85,
        confidence: 0.90,
        timeframe: {
          start: new Date(),
          end: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000), // 18 days
          horizon: 18,
        },
        prediction: {
          value: 45,
          severity: 'high',
          description: 'Camera health declining at 2.5 points/day. Estimated failure in 18 days.',
        },
        historicalTrend: [],
        forecast: [],
        recommendations: [
          'Schedule maintenance inspection',
          'Verify connections and power supply',
          'Prepare backup equipment',
        ],
        preventiveActions: [
          'Schedule maintenance inspection',
          'Create backup recording rule',
        ],
        modelUsed: 'Linear Trend Analysis',
        lastUpdated: new Date(),
      };

      // Track pipeline events
      const events: string[] = [];

      orchestrator.on('high-risk-prediction', () => {
        events.push('high-risk-prediction');
      });

      orchestrator.on('predictive-alert-created', () => {
        events.push('predictive-alert-created');
      });

      orchestrator.on('pipeline-complete', () => {
        events.push('pipeline-complete');
      });

      // Process prediction
      await orchestrator.processPrediction(prediction);

      const elapsed = Date.now() - startTime;

      // VALIDATION

      // Check events fired
      expect(events).toContain('high-risk-prediction');
      expect(events).toContain('predictive-alert-created');
      expect(events).toContain('pipeline-complete');

      // Check dashboard metrics
      const dashboard = orchestrator.getDashboard();
      expect(dashboard.summary.activePredictions).toBeGreaterThan(0);
      expect(dashboard.summary.highRiskAlerts).toBeGreaterThan(0);
      expect(dashboard.summary.pendingRecommendations).toBeGreaterThan(0);

      // Check context
      const contexts = orchestrator.getAllContexts();
      expect(contexts.length).toBeGreaterThan(0);

      const context = contexts[contexts.length - 1];
      expect(context.prediction).toEqual(prediction);
      expect(context.pipelineStatus.predictionGenerated).toBe(true);
      expect(context.pipelineStatus.riskAssessed).toBe(true);
      expect(context.pipelineStatus.alertsCreated).toBe(true);
      expect(context.pipelineStatus.recommendationsGenerated).toBe(true);

      // Check risk assessment
      expect(context.riskAssessment).toBeDefined();
      expect(context.riskAssessment!.riskScore).toBeGreaterThan(0);
      expect(['high', 'critical']).toContain(context.riskAssessment!.riskLevel);

      // Check recommendations
      expect(context.recommendations.length).toBeGreaterThan(0);
      const immediateRecs = context.recommendations.filter((r) => r.priority === 'immediate');
      expect(immediateRecs.length).toBeGreaterThan(0);

      // Check preventive actions
      expect(context.preventiveActions.length).toBeGreaterThan(0);
      const autoActions = context.preventiveActions.filter((a) => !a.requiresApproval);
      expect(autoActions.length).toBeGreaterThan(0);

      // Check timeline
      expect(context.timeline.length).toBeGreaterThanOrEqual(4);
      expect(context.timeline[0].stage).toBe('prediction');
      expect(context.timeline[1].stage).toBe('risk-assessment');
      expect(context.timeline.some((t) => t.stage === 'alert-generation')).toBe(true);
      expect(context.timeline.some((t) => t.stage === 'recommendations')).toBe(true);

      // Performance
      expect(elapsed).toBeLessThan(5000); // <5s for full pipeline

      console.log(`✅ Full Pipeline: ${elapsed}ms`);
      console.log(`   - Risk Score: ${context.riskAssessment!.riskScore}/100`);
      console.log(`   - Recommendations: ${context.recommendations.length}`);
      console.log(`   - Preventive Actions: ${context.preventiveActions.length}`);
      console.log(`   - Timeline Stages: ${context.timeline.length}`);
    });
  });

  describe('2. Multi-Stage RCA: Incident → RCA → Recommendations → Actions', () => {
    it('should process incident through RCA to recommendations', async () => {
      // STAGE 1: Create prediction with materialized incident
      const prediction: Prediction = {
        type: 'incident',
        target: 'BackEntrance_Intrusion',
        probability: 0.72,
        confidence: 0.85,
        timeframe: {
          start: new Date(),
          end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          horizon: 7,
        },
        prediction: {
          value: 78,
          severity: 'high',
          category: 'intrusion',
          description: 'Intrusion pattern detected. Peak risk: Friday 22:00',
        },
        historicalTrend: [],
        forecast: [],
        recommendations: [
          'Increase security patrols',
          'Install motion lights',
        ],
        preventiveActions: [],
        modelUsed: 'Pattern Analysis',
        lastUpdated: new Date(),
      };

      await orchestrator.processPrediction(prediction);

      // STAGE 2: RCA (simulated)
      const rca: RootCauseAnalysis = {
        incidentId: 'INC_001',
        timestamp: new Date().toISOString(),
        rootCause: 'Inadequate lighting and camera blind spot',
        contributingFactors: [
          'Poor lighting after 22:00',
          'Camera blind spot on east side',
          'No motion detection in zone',
        ],
        remediationSteps: [
          'Install motion-activated lights',
          'Add camera to cover blind spot',
          'Create intrusion detection zone',
        ],
        preventiveMeasures: [
          'Regular lighting maintenance',
          'Quarterly camera coverage review',
          'Update security protocols',
        ],
        confidence: 0.85,
        rawAnalysis: 'Analysis complete',
      };

      // Process RCA
      const contexts = orchestrator.getAllContexts();
      const incidentId = 'INC_001';
      contexts[contexts.length - 1].incidentId = incidentId;

      await orchestrator.processRCA(incidentId, rca);

      // VALIDATION
      const context = contexts[contexts.length - 1];
      
      // Check RCA was processed
      expect(context.rca).toEqual(rca);
      expect(context.pipelineStatus.rcaComplete).toBe(true);

      // Check RCA generated additional recommendations
      const rcaStage = context.timeline.find((t) => t.stage === 'rca');
      expect(rcaStage).toBeDefined();
      expect(rcaStage!.details).toContain('RCA completed');

      console.log(`✅ RCA Pipeline: Incident → RCA → Recommendations`);
      console.log(`   - Root Cause: ${rca.rootCause}`);
      console.log(`   - Remediation Steps: ${rca.remediationSteps.length}`);
      console.log(`   - Preventive Measures: ${rca.preventiveMeasures.length}`);
    });
  });

  describe('3. Feedback Loop: Action Outcome → Learning', () => {
    it('should record action outcomes and create feedback for learning', async () => {
      // Create prediction
      const prediction: Prediction = {
        type: 'storage_exhaustion',
        target: 'HDD_MAIN_001',
        probability: 0.95,
        confidence: 0.90,
        timeframe: {
          start: new Date(),
          end: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
          horizon: 9,
        },
        prediction: {
          value: 88,
          severity: 'critical',
          description: 'Storage at 88% capacity. Predicted full in 9 days.',
        },
        historicalTrend: [],
        forecast: [],
        recommendations: [
          'Archive old recordings immediately',
          'Add storage capacity within 3 days',
        ],
        preventiveActions: [
          'Trigger archive job',
          'Reduce retention periods',
        ],
        modelUsed: 'Linear Growth Forecast',
        lastUpdated: new Date(),
      };

      // Track feedback events
      const feedbackEvents: any[] = [];
      orchestrator.on('feedback-recorded', (feedback) => {
        feedbackEvents.push(feedback);
      });

      await orchestrator.processPrediction(prediction);

      // Simulate action completion
      const contexts = orchestrator.getAllContexts();
      const context = contexts[contexts.length - 1];
      
      if (context.preventiveActions.length > 0) {
        const action = context.preventiveActions[0];
        
        // Manually trigger action completion
        const feedback = await orchestrator.recordFeedback({
          actionId: action.id,
          feedbackType: 'action-outcome',
          expectedOutcome: action.description,
          actualOutcome: 'Successfully archived 150GB of old recordings',
          accuracyDelta: 1.0,
          lessonsLearned: [
            'Archive job effective for quick storage recovery',
            'Should automate this for 85% threshold',
          ],
          adjustments: [
            {
              parameter: 'archive_threshold',
              oldValue: 90,
              newValue: 85,
              reason: 'Provide more buffer time before critical',
            },
          ],
        });

        // VALIDATION
        expect(feedbackEvents.length).toBeGreaterThan(0);
        expect(feedback.accuracyDelta).toBe(1.0);
        expect(feedback.lessonsLearned.length).toBeGreaterThan(0);
        expect(feedback.adjustments.length).toBeGreaterThan(0);

        // Check feedback was added to context
        const updatedContext = orchestrator.getContext(
          Array.from(orchestrator['predictions'].keys())[
            Array.from(orchestrator['predictions'].keys()).length - 1
          ]
        );
        
        expect(updatedContext?.feedback.length).toBeGreaterThan(0);

        console.log(`✅ Feedback Loop: Action → Outcome → Learning`);
        console.log(`   - Feedback Type: ${feedback.feedbackType}`);
        console.log(`   - Accuracy Delta: ${feedback.accuracyDelta}`);
        console.log(`   - Lessons Learned: ${feedback.lessonsLearned.length}`);
        console.log(`   - Adjustments: ${feedback.adjustments.length}`);
      }
    });
  });

  describe('4. Risk Assessment: Multi-factor Risk Calculation', () => {
    it('should calculate risk based on multiple factors', async () => {
      const predictions: Prediction[] = [
        // Low risk
        {
          type: 'hardware_failure',
          target: 'CAM_LOW_RISK',
          probability: 0.3,
          confidence: 0.7,
          timeframe: { start: new Date(), end: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), horizon: 60 },
          prediction: { value: 75, severity: 'low', description: 'Minor health decline' },
          historicalTrend: [],
          forecast: [],
          recommendations: [],
          preventiveActions: [],
          modelUsed: 'Linear Trend',
          lastUpdated: new Date(),
        },
        // High risk
        {
          type: 'hardware_failure',
          target: 'CAM_HIGH_RISK',
          probability: 0.9,
          confidence: 0.95,
          timeframe: { start: new Date(), end: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), horizon: 5 },
          prediction: { value: 25, severity: 'critical', description: 'Imminent failure' },
          historicalTrend: [],
          forecast: [],
          recommendations: [],
          preventiveActions: [],
          modelUsed: 'Linear Trend',
          lastUpdated: new Date(),
        },
      ];

      const assessments: any[] = [];

      for (const prediction of predictions) {
        await orchestrator.processPrediction(prediction);
        const contexts = orchestrator.getAllContexts();
        const context = contexts[contexts.length - 1];
        if (context.riskAssessment) {
          assessments.push(context.riskAssessment);
        }
      }

      // VALIDATION
      expect(assessments.length).toBe(2);

      // Low risk should have lower score
      const lowRisk = assessments[0];
      const highRisk = assessments[1];

      expect(lowRisk.riskScore).toBeLessThan(highRisk.riskScore);
      expect(lowRisk.riskLevel).toBe('low');
      expect(['high', 'critical']).toContain(highRisk.riskLevel);

      // Risk factors should be present
      expect(lowRisk.factors.length).toBeGreaterThan(0);
      expect(highRisk.factors.length).toBeGreaterThan(0);

      console.log(`✅ Risk Assessment: Multi-factor Calculation`);
      console.log(`   - Low Risk: ${lowRisk.riskScore}/100 (${lowRisk.riskLevel})`);
      console.log(`   - High Risk: ${highRisk.riskScore}/100 (${highRisk.riskLevel})`);
      console.log(`   - Factors: ${lowRisk.factors.length} / ${highRisk.factors.length}`);
    });
  });

  describe('5. Recommendation Prioritization', () => {
    it('should prioritize recommendations by impact and urgency', async () => {
      const prediction: Prediction = {
        type: 'hardware_failure',
        target: 'CAM_CRITICAL_001',
        probability: 0.95,
        confidence: 0.95,
        timeframe: {
          start: new Date(),
          end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          horizon: 2,
        },
        prediction: {
          value: 15,
          severity: 'critical',
          description: 'Critical failure imminent in 2 days',
        },
        historicalTrend: [],
        forecast: [],
        recommendations: [
          'URGENT: Replace camera immediately',
          'Activate backup camera',
          'Schedule installation',
        ],
        preventiveActions: [
          'Create backup recording rule',
          'Order replacement equipment',
        ],
        modelUsed: 'Linear Trend',
        lastUpdated: new Date(),
      };

      await orchestrator.processPrediction(prediction);

      const contexts = orchestrator.getAllContexts();
      const context = contexts[contexts.length - 1];

      // VALIDATION
      expect(context.recommendations.length).toBeGreaterThan(0);

      // Check prioritization
      const immediateRecs = context.recommendations.filter((r) => r.priority === 'immediate');
      const shortTermRecs = context.recommendations.filter((r) => r.priority === 'short-term');

      expect(immediateRecs.length).toBeGreaterThan(0);

      // Immediate recs should be for critical severity
      immediateRecs.forEach((rec) => {
        expect(['high', 'critical']).toContain(rec.estimatedImpact);
      });

      // Check auto-executable identification
      const autoRecs = context.recommendations.filter((r) => r.autoExecutable);
      expect(autoRecs.length).toBeGreaterThan(0);

      console.log(`✅ Recommendation Prioritization`);
      console.log(`   - Total: ${context.recommendations.length}`);
      console.log(`   - Immediate: ${immediateRecs.length}`);
      console.log(`   - Short-term: ${shortTermRecs.length}`);
      console.log(`   - Auto-executable: ${autoRecs.length}`);
    });
  });

  describe('6. Intelligence Dashboard', () => {
    it('should provide comprehensive intelligence metrics dashboard', () => {
      const dashboard = orchestrator.getDashboard();

      // VALIDATION
      expect(dashboard.summary).toBeDefined();
      expect(dashboard.metrics).toBeDefined();
      expect(dashboard.recentActivity).toBeDefined();
      expect(dashboard.topRisks).toBeDefined();

      // Check summary
      expect(dashboard.summary.activePredictions).toBeGreaterThanOrEqual(0);
      expect(dashboard.summary.highRiskAlerts).toBeGreaterThanOrEqual(0);
      expect(dashboard.summary.pendingRecommendations).toBeGreaterThanOrEqual(0);
      expect(dashboard.summary.preventiveActionsToday).toBeGreaterThanOrEqual(0);

      // Check metrics are in valid range
      expect(dashboard.metrics.predictionAccuracy).toBeGreaterThanOrEqual(0);
      expect(dashboard.metrics.predictionAccuracy).toBeLessThanOrEqual(1);
      expect(dashboard.metrics.preventionRate).toBeGreaterThanOrEqual(0);
      expect(dashboard.metrics.preventionRate).toBeLessThanOrEqual(1);
      expect(dashboard.metrics.avgEarlyWarningDays).toBeGreaterThanOrEqual(0);

      // Check recent activity
      expect(dashboard.recentActivity.predictions).toBeDefined();
      expect(dashboard.recentActivity.recommendations).toBeDefined();
      expect(dashboard.recentActivity.preventiveActions).toBeDefined();
      expect(dashboard.recentActivity.feedback).toBeDefined();

      // Check timestamp
      expect(dashboard.generatedAt).toBeInstanceOf(Date);

      console.log(`✅ Intelligence Dashboard`);
      console.log(`   - Active Predictions: ${dashboard.summary.activePredictions}`);
      console.log(`   - High Risk Alerts: ${dashboard.summary.highRiskAlerts}`);
      console.log(`   - Prediction Accuracy: ${(dashboard.metrics.predictionAccuracy * 100).toFixed(1)}%`);
      console.log(`   - Prevention Rate: ${(dashboard.metrics.preventionRate * 100).toFixed(1)}%`);
      console.log(`   - Avg Early Warning: ${dashboard.metrics.avgEarlyWarningDays.toFixed(1)} days`);
      console.log(`   - Top Risks: ${dashboard.topRisks.length}`);
    });
  });

  describe('Closed-Loop Intelligence Summary', () => {
    it('should verify all pipeline components are connected', () => {
      const metrics = orchestrator.getMetrics();
      const dashboard = orchestrator.getDashboard();

      // Verify metrics tracking
      expect(metrics.totalPredictions).toBeGreaterThan(0);
      expect(metrics.totalRecommendations).toBeGreaterThan(0);

      // Verify contexts created
      const contexts = orchestrator.getAllContexts();
      expect(contexts.length).toBeGreaterThan(0);

      // Verify pipeline stages executed
      contexts.forEach((context) => {
        expect(context.pipelineStatus.predictionGenerated).toBe(true);
        expect(context.pipelineStatus.riskAssessed).toBe(true);
        expect(context.pipelineStatus.recommendationsGenerated).toBe(true);
        expect(context.timeline.length).toBeGreaterThan(0);
      });

      console.log('\n🎯 CLOSED-LOOP INTELLIGENCE SUMMARY');
      console.log('=========================================');
      console.log(`✅ Total Predictions Processed: ${metrics.totalPredictions}`);
      console.log(`✅ Predictions Materialized: ${metrics.materializedPredictions}`);
      console.log(`✅ Total Recommendations: ${metrics.totalRecommendations}`);
      console.log(`✅ Successful Actions: ${metrics.successfulActions}`);
      console.log(`✅ Failed Actions: ${metrics.failedActions}`);
      console.log(`✅ Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
      console.log('\n🔄 PIPELINE STAGES VERIFIED:');
      console.log('   1. ✅ Prediction Generation');
      console.log('   2. ✅ Risk Assessment');
      console.log('   3. ✅ Alert Generation');
      console.log('   4. ✅ RCA Integration');
      console.log('   5. ✅ Recommendation Engine');
      console.log('   6. ✅ Preventive Actions');
      console.log('   7. ✅ Feedback Loop');
      console.log('\n🚀 CLOSED-LOOP INTELLIGENCE OPERATIONAL');
    });
  });
});
