/**
 * MindSense De-Escalation Coaching Service
 * 
 * Production-grade real-time guidance system for security personnel:
 * - Situation-aware de-escalation techniques
 * - Real-time coaching based on person's emotional state
 * - Cultural and contextual sensitivity
 * - Evidence-based conflict resolution strategies
 * - Multi-scenario playbooks
 * 
 * Based on:
 * - Crisis Intervention Team (CIT) training
 * - Verbal Judo techniques
 * - Trauma-informed practices
 * - Active listening protocols
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";

/**
 * De-escalation Situation Types
 */
export type SituationType =
  | "aggressive-customer"
  | "distressed-person"
  | "suspicious-behavior"
  | "verbal-conflict"
  | "medical-emergency"
  | "theft-confrontation"
  | "unauthorized-access"
  | "crowd-control"
  | "mental-health-crisis"
  | "domestic-dispute";

/**
 * De-escalation Phase
 */
export type DeEscalationPhase =
  | "assessment"       // Initial situation assessment
  | "approach"         // How to approach the person
  | "engagement"       // Building rapport
  | "resolution"       // Resolving the situation
  | "monitoring"       // Post-incident monitoring
  | "handoff";         // Transitioning to authorities

/**
 * Communication Strategy
 */
export interface CommunicationStrategy {
  tone: "calm" | "authoritative" | "empathetic" | "professional";
  volume: "soft" | "normal" | "firm" | "loud";
  pace: "slow" | "moderate" | "quick";
  bodyLanguage: string[];
  eyeContact: "minimal" | "moderate" | "direct";
  proximityDistance: "far" | "moderate" | "close"; // feet
}

/**
 * De-escalation Technique
 */
export interface DeEscalationTechnique {
  id: string;
  name: string;
  category: "verbal" | "non-verbal" | "environmental" | "tactical";
  description: string;
  whenToUse: string[];
  howToExecute: string[];
  warnings: string[];
  examples: string[];
  successRate: number;
}

/**
 * Real-time Coaching Recommendation
 */
export interface CoachingRecommendation {
  id: string;
  situationType: SituationType;
  phase: DeEscalationPhase;
  priority: "critical" | "high" | "medium" | "low";
  
  // Assessment
  situationAssessment: {
    threatLevel: string;
    emotionalState: string;
    stressLevel: number;
    deceptionIndicators: number;
    intent: string;
    riskFactors: string[];
  };
  
  // Immediate Actions
  immediateDos: string[];
  immediateDonts: string[];
  
  // Communication
  communicationStrategy: CommunicationStrategy;
  suggestedPhrases: string[];
  avoidPhrases: string[];
  
  // Techniques
  recommendedTechniques: DeEscalationTechnique[];
  
  // Safety
  safetyPrecautions: string[];
  backupRequired: boolean;
  exitStrategy: string;
  
  // Monitoring
  signalsToWatch: string[];
  escalationTriggers: string[];
  successIndicators: string[];
  
  timestamp: string;
}

/**
 * De-escalation Playbook
 */
export interface DeEscalationPlaybook {
  id: string;
  name: string;
  situationType: SituationType;
  description: string;
  
  // Phases
  phases: Array<{
    phase: DeEscalationPhase;
    duration: string;
    objectives: string[];
    techniques: string[];
    transitionCriteria: string[];
  }>;
  
  // Context-specific guidance
  culturalConsiderations: string[];
  languageBarriers: string[];
  accessibilityNotes: string[];
  
  // Resources
  backupProtocols: string[];
  emergencyContacts: Array<{ role: string; action: string }>;
}

export class MindSenseDeEscalationService {
  private playbooks = new Map<SituationType, DeEscalationPlaybook>();
  private techniques = new Map<string, DeEscalationTechnique>();

  constructor(private pool: Pool) {
    this.initializePlaybooks();
    this.initializeTechniques();
  }

  /**
   * Get real-time coaching recommendation
   */
  async getCoachingRecommendation(params: {
    cameraId: string;
    personTrackId: string;
    situationType: SituationType;
    emotionalState: {
      emotion: string;
      stressLevel: number;
      deceptionScore: number;
      arousal: number;
      valence: number;
    };
    behaviorContext: {
      intent: string;
      threatLevel: string;
      threatScore: number;
      indicators: Record<string, any>;
    };
    securityStaffId?: string;
  }): Promise<CoachingRecommendation> {
    const { emotionalState, behaviorContext, situationType } = params;

    // Determine current phase
    const phase = this.determinePhase(behaviorContext.threatLevel, emotionalState.stressLevel);

    // Get appropriate playbook
    const playbook = this.playbooks.get(situationType);
    if (!playbook) {
      throw new Error(`No playbook found for situation type: ${situationType}`);
    }

    // Build situation assessment
    const situationAssessment = {
      threatLevel: behaviorContext.threatLevel,
      emotionalState: emotionalState.emotion,
      stressLevel: emotionalState.stressLevel,
      deceptionIndicators: emotionalState.deceptionScore,
      intent: behaviorContext.intent,
      riskFactors: this.identifyRiskFactors(emotionalState, behaviorContext),
    };

    // Determine communication strategy
    const communicationStrategy = this.selectCommunicationStrategy(
      emotionalState,
      behaviorContext.threatLevel
    );

    // Get recommended techniques
    const recommendedTechniques = this.selectTechniques(
      situationType,
      phase,
      emotionalState,
      behaviorContext
    );

    // Generate immediate guidance
    const immediateDos = this.generateImmediateDos(
      situationType,
      phase,
      emotionalState,
      behaviorContext
    );

    const immediateDonts = this.generateImmediateDonts(
      situationType,
      emotionalState,
      behaviorContext
    );

    // Generate suggested phrases
    const suggestedPhrases = this.generateSuggestedPhrases(
      situationType,
      emotionalState,
      behaviorContext
    );

    const avoidPhrases = this.generateAvoidPhrases(
      situationType,
      emotionalState
    );

    // Safety precautions
    const safetyPrecautions = this.generateSafetyPrecautions(
      behaviorContext.threatLevel,
      behaviorContext.indicators
    );

    const backupRequired = behaviorContext.threatLevel === "high" || 
                          behaviorContext.threatLevel === "critical" ||
                          behaviorContext.indicators.weaponIndicators;

    const exitStrategy = this.generateExitStrategy(behaviorContext.threatLevel);

    // Monitoring guidance
    const signalsToWatch = this.generateSignalsToWatch(emotionalState, behaviorContext);
    const escalationTriggers = this.generateEscalationTriggers(situationType);
    const successIndicators = this.generateSuccessIndicators(situationType);

    // Determine priority
    const priority = this.determinePriority(behaviorContext.threatLevel, emotionalState.stressLevel);

    const recommendation: CoachingRecommendation = {
      id: randomUUID(),
      situationType,
      phase,
      priority,
      situationAssessment,
      immediateDos,
      immediateDonts,
      communicationStrategy,
      suggestedPhrases,
      avoidPhrases,
      recommendedTechniques,
      safetyPrecautions,
      backupRequired,
      exitStrategy,
      signalsToWatch,
      escalationTriggers,
      successIndicators,
      timestamp: new Date().toISOString(),
    };

    // Log recommendation for analytics
    await this.logCoachingRecommendation(params, recommendation);

    return recommendation;
  }

  /**
   * Determine current de-escalation phase
   */
  private determinePhase(threatLevel: string, stressLevel: number): DeEscalationPhase {
    if (threatLevel === "critical") return "handoff";
    if (threatLevel === "high") return "resolution";
    if (stressLevel > 0.7) return "engagement";
    if (stressLevel > 0.4) return "approach";
    return "assessment";
  }

  /**
   * Select communication strategy based on emotional state
   */
  private selectCommunicationStrategy(
    emotionalState: { emotion: string; stressLevel: number; arousal: number },
    threatLevel: string
  ): CommunicationStrategy {
    const { emotion, stressLevel, arousal } = emotionalState;

    // High threat or anger = authoritative but calm
    if (threatLevel === "high" || emotion === "anger") {
      return {
        tone: "authoritative",
        volume: "firm",
        pace: "moderate",
        bodyLanguage: [
          "Stand at angle, not face-to-face",
          "Keep hands visible and open",
          "Maintain confident posture",
          "Avoid pointing or aggressive gestures",
        ],
        eyeContact: "moderate",
        proximityDistance: "moderate", // 6-8 feet
      };
    }

    // Fear or distress = empathetic and gentle
    if (emotion === "fear" || emotion === "sadness") {
      return {
        tone: "empathetic",
        volume: "soft",
        pace: "slow",
        bodyLanguage: [
          "Lower your body posture slightly",
          "Use open, welcoming gestures",
          "Nod to show understanding",
          "Keep movements slow and predictable",
        ],
        eyeContact: "moderate",
        proximityDistance: "moderate",
      };
    }

    // High stress = calm and reassuring
    if (stressLevel > 0.6 || arousal > 0.7) {
      return {
        tone: "calm",
        volume: "soft",
        pace: "slow",
        bodyLanguage: [
          "Keep hands visible",
          "Use calm, slow movements",
          "Mirror their posture subtly",
          "Maintain respectful distance",
        ],
        eyeContact: "moderate",
        proximityDistance: "moderate",
      };
    }

    // Default professional approach
    return {
      tone: "professional",
      volume: "normal",
      pace: "moderate",
      bodyLanguage: [
        "Maintain open posture",
        "Use appropriate hand gestures",
        "Stand confidently",
        "Respect personal space",
      ],
      eyeContact: "moderate",
      proximityDistance: "moderate",
    };
  }

  /**
   * Select appropriate de-escalation techniques
   */
  private selectTechniques(
    situationType: SituationType,
    phase: DeEscalationPhase,
    emotionalState: any,
    behaviorContext: any
  ): DeEscalationTechnique[] {
    const techniques: DeEscalationTechnique[] = [];

    // Always include active listening
    const activeListening = this.techniques.get("active-listening");
    if (activeListening) techniques.push(activeListening);

    // Emotion-specific techniques
    if (emotionalState.emotion === "anger") {
      const empathyStatement = this.techniques.get("empathy-statement");
      const timeOut = this.techniques.get("tactical-timeout");
      if (empathyStatement) techniques.push(empathyStatement);
      if (timeOut) techniques.push(timeOut);
    }

    if (emotionalState.emotion === "fear" || emotionalState.emotion === "sadness") {
      const reassurance = this.techniques.get("reassurance");
      if (reassurance) techniques.push(reassurance);
    }

    // High stress techniques
    if (emotionalState.stressLevel > 0.7) {
      const grounding = this.techniques.get("grounding");
      if (grounding) techniques.push(grounding);
    }

    // Situation-specific
    if (behaviorContext.threatLevel === "high" || behaviorContext.threatLevel === "critical") {
      const limitSetting = this.techniques.get("limit-setting");
      if (limitSetting) techniques.push(limitSetting);
    }

    return techniques.slice(0, 4); // Top 4 techniques
  }

  /**
   * Generate immediate dos
   */
  private generateImmediateDos(
    situationType: SituationType,
    phase: DeEscalationPhase,
    emotionalState: any,
    behaviorContext: any
  ): string[] {
    const dos: string[] = [];

    // Universal dos
    dos.push("Remain calm and composed");
    dos.push("Listen actively and acknowledge their feelings");
    dos.push("Maintain safe distance and clear exit path");

    // Emotion-specific
    if (emotionalState.emotion === "anger") {
      dos.push("Give them space to vent (without escalating)");
      dos.push("Acknowledge their frustration");
      dos.push("Speak in calm, measured tones");
    }

    if (emotionalState.emotion === "fear") {
      dos.push("Reassure them of their safety");
      dos.push("Explain what you're doing before you do it");
      dos.push("Offer assistance or support");
    }

    // Threat-specific
    if (behaviorContext.threatLevel === "high" || behaviorContext.threatLevel === "critical") {
      dos.push("Request backup immediately");
      dos.push("Set clear, firm boundaries");
      dos.push("Document everything");
    }

    return dos;
  }

  /**
   * Generate immediate don'ts
   */
  private generateImmediateDonts(
    situationType: SituationType,
    emotionalState: any,
    behaviorContext: any
  ): string[] {
    const donts: string[] = [];

    // Universal don'ts
    donts.push("Don't touch them without permission");
    donts.push("Don't argue or become defensive");
    donts.push("Don't make promises you can't keep");
    donts.push("Don't turn your back completely");

    // Emotion-specific
    if (emotionalState.emotion === "anger") {
      donts.push("Don't raise your voice or match their energy");
      donts.push("Don't dismiss or minimize their concerns");
      donts.push("Don't use aggressive body language");
    }

    if (emotionalState.deceptionScore > 0.7) {
      donts.push("Don't accuse them directly");
      donts.push("Don't corner them or block exits");
    }

    return donts;
  }

  /**
   * Generate suggested phrases
   */
  private generateSuggestedPhrases(
    situationType: SituationType,
    emotionalState: any,
    behaviorContext: any
  ): string[] {
    const phrases: string[] = [];

    // Opening
    phrases.push("I'm here to help. What's going on?");
    phrases.push("I can see you're [upset/frustrated/worried]. Let's talk about it.");

    // Empathy statements
    if (emotionalState.emotion === "anger") {
      phrases.push("I understand this is frustrating for you.");
      phrases.push("That sounds really difficult. Tell me more.");
    }

    if (emotionalState.emotion === "fear" || emotionalState.emotion === "sadness") {
      phrases.push("You're safe here. I'm here to help.");
      phrases.push("It's okay to feel this way. Take your time.");
    }

    // Active listening
    phrases.push("Help me understand what you need.");
    phrases.push("What would make this situation better for you?");

    // De-escalation
    if (behaviorContext.threatLevel === "medium" || behaviorContext.threatLevel === "high") {
      phrases.push("I need you to [specific action] so we can resolve this.");
      phrases.push("Let's take a moment and figure this out together.");
    }

    return phrases;
  }

  /**
   * Generate phrases to avoid
   */
  private generateAvoidPhrases(situationType: SituationType, emotionalState: any): string[] {
    return [
      "Calm down or Relax (invalidating)",
      "You're overreacting (dismissive)",
      "This is your fault (blaming)",
      "You need to... (commanding)",
      "I don't have time for this (dismissive)",
      "You're being ridiculous (insulting)",
      "Just do what I say (authoritarian)",
      "It's not that bad (minimizing)",
    ];
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(emotionalState: any, behaviorContext: any): string[] {
    const factors: string[] = [];

    if (emotionalState.emotion === "anger" && emotionalState.arousal > 0.8) {
      factors.push("High anger with high arousal - potential for violence");
    }

    if (emotionalState.deceptionScore > 0.7) {
      factors.push("High deception indicators - concealing true intent");
    }

    if (behaviorContext.indicators?.weaponIndicators) {
      factors.push("CRITICAL: Weapon indicators detected");
    }

    if (behaviorContext.indicators?.surveillanceBehavior) {
      factors.push("Surveillance behavior - planning potential threat");
    }

    if (emotionalState.stressLevel > 0.8) {
      factors.push("Extreme stress - unpredictable behavior possible");
    }

    return factors;
  }

  /**
   * Generate safety precautions
   */
  private generateSafetyPrecautions(threatLevel: string, indicators: any): string[] {
    const precautions: string[] = [
      "Maintain safe distance (6-8 feet minimum)",
      "Keep clear path to exits",
      "Keep hands visible",
    ];

    if (threatLevel === "high" || threatLevel === "critical") {
      precautions.push("DO NOT engage alone - wait for backup");
      precautions.push("Keep physical barriers between you and subject if possible");
      precautions.push("Have emergency alert ready");
    }

    if (indicators?.weaponIndicators) {
      precautions.push("CRITICAL: Suspected weapon - maintain maximum distance");
      precautions.push("Activate emergency protocols immediately");
      precautions.push("Evacuate civilians from area if safe to do so");
    }

    return precautions;
  }

  /**
   * Generate exit strategy
   */
  private generateExitStrategy(threatLevel: string): string {
    if (threatLevel === "critical") {
      return "Immediate tactical withdrawal. Create distance, seek cover, call for backup. Do not turn back on subject.";
    }

    if (threatLevel === "high") {
      return "Controlled disengagement. Use verbal de-escalation while slowly backing away. Maintain visual contact. Signal for backup.";
    }

    return "Natural conversation ending. Provide resources, set follow-up if needed, thank them for their cooperation.";
  }

  /**
   * Generate signals to watch
   */
  private generateSignalsToWatch(emotionalState: any, behaviorContext: any): string[] {
    return [
      "Clenching fists or jaw",
      "Sudden posture changes",
      "Moving into your personal space",
      "Scanning for exits or weapons",
      "Verbal threats or aggressive language",
      "Emotional escalation (louder, faster speech)",
      "Physical contact attempts",
      "Pacing or erratic movement",
    ];
  }

  /**
   * Generate escalation triggers
   */
  private generateEscalationTriggers(situationType: SituationType): string[] {
    return [
      "Feeling trapped or cornered",
      "Feeling disrespected or humiliated",
      "Perceiving threat to safety",
      "Loss of control over situation",
      "Substance influence",
      "Mental health crisis",
      "Past trauma triggers",
      "Lack of options or resources",
    ];
  }

  /**
   * Generate success indicators
   */
  private generateSuccessIndicators(situationType: SituationType): string[] {
    return [
      "Decreased volume and slower speech",
      "More relaxed body language",
      "Making eye contact",
      "Answering questions cooperatively",
      "Accepting offered solutions",
      "Showing signs of relief (sighing, smiling)",
      "Asking for help or information",
      "Moving away from aggressive posture",
    ];
  }

  /**
   * Determine priority level
   */
  private determinePriority(threatLevel: string, stressLevel: number): "critical" | "high" | "medium" | "low" {
    if (threatLevel === "critical") return "critical";
    if (threatLevel === "high") return "high";
    if (stressLevel > 0.7 || threatLevel === "medium") return "medium";
    return "low";
  }

  /**
   * Initialize de-escalation playbooks
   */
  private initializePlaybooks(): void {
    // Aggressive Customer playbook
    this.playbooks.set("aggressive-customer", {
      id: "playbook-aggressive-customer",
      name: "Aggressive Customer De-escalation",
      situationType: "aggressive-customer",
      description: "Protocol for handling angry or aggressive customers in retail/banking environment",
      phases: [
        {
          phase: "assessment",
          duration: "30 seconds",
          objectives: ["Assess threat level", "Identify trigger", "Ensure personal safety"],
          techniques: ["Observation", "Distance maintenance"],
          transitionCriteria: ["Safe to approach", "Backup present if needed"],
        },
        {
          phase: "approach",
          duration: "1-2 minutes",
          objectives: ["Establish contact", "Show respect", "De-escalate tension"],
          techniques: ["Calm greeting", "Active listening", "Empathy statement"],
          transitionCriteria: ["Person acknowledges you", "Anger begins to decrease"],
        },
        {
          phase: "engagement",
          duration: "3-5 minutes",
          objectives: ["Understand their issue", "Build rapport", "Offer solutions"],
          techniques: ["Active listening", "Validation", "Problem-solving"],
          transitionCriteria: ["Issue identified", "Person calmer", "Working cooperatively"],
        },
        {
          phase: "resolution",
          duration: "2-3 minutes",
          objectives: ["Resolve issue", "Restore dignity", "Ensure satisfaction"],
          techniques: ["Solution offering", "Agreement", "Thank you"],
          transitionCriteria: ["Issue resolved", "Person satisfied"],
        },
      ],
      culturalConsiderations: [
        "Be aware of cultural differences in eye contact expectations",
        "Some cultures value indirect communication",
        "Respect personal space boundaries (varies by culture)",
      ],
      languageBarriers: [
        "Use simple, clear language",
        "Speak slowly and clearly",
        "Use visual aids if available",
        "Get translator if available",
      ],
      accessibilityNotes: [
        "Ensure person can see/hear you clearly",
        "Accommodate mobility needs",
        "Provide written information if hearing impaired",
      ],
      backupProtocols: [
        "Call supervisor if situation escalates",
        "Request security if threats made",
        "Call police if violence imminent",
      ],
      emergencyContacts: [
        { role: "Security Supervisor", action: "For immediate backup" },
        { role: "Store Manager", action: "For authority and decisions" },
        { role: "Police", action: "For threats or violence" },
      ],
    });

    // Additional playbooks would be added here...
  }

  /**
   * Initialize de-escalation techniques
   */
  private initializeTechniques(): void {
    this.techniques.set("active-listening", {
      id: "tech-active-listening",
      name: "Active Listening",
      category: "verbal",
      description: "Fully concentrate, understand, respond and remember what is being said",
      whenToUse: ["All situations", "Building rapport", "Understanding concerns"],
      howToExecute: [
        "Give full attention to the speaker",
        "Use verbal cues: 'I see', 'Go on', 'Tell me more'",
        "Paraphrase back what you heard",
        "Ask clarifying questions",
        "Don't interrupt or plan your response while they talk",
      ],
      warnings: ["Don't fake attention", "Don't multitask"],
      examples: [
        "So what I'm hearing is that you're frustrated because...",
        "It sounds like you feel...",
        "Help me understand...",
      ],
      successRate: 0.9,
    });

    this.techniques.set("empathy-statement", {
      id: "tech-empathy",
      name: "Empathy Statement",
      category: "verbal",
      description: "Acknowledge and validate the person's feelings",
      whenToUse: ["Person is upset", "Showing emotion", "Needs validation"],
      howToExecute: [
        "Identify their emotion",
        "State that you understand how they feel",
        "Validate their experience",
        "Don't say 'I know how you feel' (you don't)",
      ],
      warnings: ["Don't be patronizing", "Must be genuine"],
      examples: [
        "I can see this has been really frustrating for you",
        "That must have been difficult",
        "I understand why you'd be upset about that",
      ],
      successRate: 0.85,
    });

    this.techniques.set("tactical-timeout", {
      id: "tech-timeout",
      name: "Tactical Timeout",
      category: "tactical",
      description: "Strategic pause to let emotions cool",
      whenToUse: ["Emotions running very high", "Conversation becoming circular", "Need to regroup"],
      howToExecute: [
        "Suggest a brief break: 'Let's take a moment...'",
        "Explain the benefit: '...so we can think clearly'",
        "Set a specific time to reconvene",
        "Use the time to get backup or supervisor if needed",
      ],
      warnings: ["Don't abandon them", "Don't make it feel like punishment"],
      examples: [
        "Let's take a few minutes to cool down and then figure this out",
        "I'm going to step away for just a moment, I'll be right back",
      ],
      successRate: 0.75,
    });

    this.techniques.set("limit-setting", {
      id: "tech-limits",
      name: "Limit Setting",
      category: "verbal",
      description: "Establish clear, firm boundaries on behavior",
      whenToUse: ["Behavior is unacceptable", "Safety at risk", "Last resort before police"],
      howToExecute: [
        "State the problem behavior clearly",
        "Explain why it's not acceptable",
        "State the consequence",
        "Offer alternative behavior",
        "Use 'I need you to...' not 'You can't...'",
      ],
      warnings: ["Don't threaten what you can't enforce", "Must follow through"],
      examples: [
        "I need you to lower your voice so we can talk",
        "I can't help you while you're yelling. When you're ready to talk calmly, I'm here",
      ],
      successRate: 0.70,
    });

    this.techniques.set("reassurance", {
      id: "tech-reassurance",
      name: "Reassurance",
      category: "verbal",
      description: "Provide comfort and safety",
      whenToUse: ["Person is fearful", "Anxious", "Distressed"],
      howToExecute: [
        "Acknowledge their fear",
        "Reassure their safety",
        "Explain what will happen next",
        "Offer support",
      ],
      warnings: ["Don't make false promises", "Be honest about limitations"],
      examples: [
        "You're safe here. I'm here to help you",
        "I know this is scary. Let's work through this together",
      ],
      successRate: 0.80,
    });

    this.techniques.set("grounding", {
      id: "tech-grounding",
      name: "Grounding Techniques",
      category: "verbal",
      description: "Help person focus on present moment and calm down",
      whenToUse: ["Panic attack", "Extreme anxiety", "Dissociation"],
      howToExecute: [
        "Guide them to focus on breathing",
        "5-4-3-2-1 technique: 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste",
        "Gentle reminders of where they are",
      ],
      warnings: ["Don't rush them", "Speak calmly and slowly"],
      examples: [
        "Let's take some slow, deep breaths together",
        "Tell me 5 things you can see right now",
      ],
      successRate: 0.82,
    });
  }

  /**
   * Log coaching recommendation
   */
  private async logCoachingRecommendation(
    params: any,
    recommendation: CoachingRecommendation
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO mindsense_coaching_recommendations (
          id, camera_id, person_track_id, situation_type, phase, priority,
          threat_level, emotional_state, stress_level, intent,
          recommended_techniques, backup_required,
          security_staff_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          recommendation.id,
          params.cameraId,
          params.personTrackId,
          recommendation.situationType,
          recommendation.phase,
          recommendation.priority,
          recommendation.situationAssessment.threatLevel,
          recommendation.situationAssessment.emotionalState,
          recommendation.situationAssessment.stressLevel,
          recommendation.situationAssessment.intent,
          JSON.stringify(recommendation.recommendedTechniques.map(t => t.name)),
          recommendation.backupRequired,
          params.securityStaffId,
          new Date(),
        ]
      );
    } catch (error) {
      console.error("Failed to log coaching recommendation:", error);
      // Don't throw - logging failure shouldn't break the service
    }
  }

  /**
   * Get playbook by situation type
   */
  getPlaybook(situationType: SituationType): DeEscalationPlaybook | undefined {
    return this.playbooks.get(situationType);
  }

  /**
   * Get technique by ID
   */
  getTechnique(techniqueId: string): DeEscalationTechnique | undefined {
    return this.techniques.get(techniqueId);
  }

  /**
   * Get all available playbooks
   */
  getAllPlaybooks(): DeEscalationPlaybook[] {
    return Array.from(this.playbooks.values());
  }

  /**
   * Get all available techniques
   */
  getAllTechniques(): DeEscalationTechnique[] {
    return Array.from(this.techniques.values());
  }
}
