/**
 * UI Type Definitions for Security Commander
 * Frontend-specific types for React components
 */

import type {
  Investigation,
  CommanderResponse,
  SecurityIncident,
  SecurityEvent,
  Evidence,
  RecommendedAction,
} from '../../types';

// Message types for chat interface
export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
  investigation?: Investigation;
  response?: CommanderResponse;
  isLoading?: boolean;
}

// UI state for investigation viewer
export interface InvestigationViewState {
  selectedIncident?: SecurityIncident;
  selectedEvent?: SecurityEvent;
  selectedEvidence?: Evidence;
  timelineFilter?: TimelineFilter;
  expandedSections: Set<string>;
}

// Timeline filtering
export interface TimelineFilter {
  eventTypes?: string[];
  severityMin?: number;
  searchText?: string;
  startTime?: Date;
  endTime?: Date;
}

// Evidence viewer state
export interface EvidenceViewerState {
  selectedIndex: number;
  isPlaying: boolean;
  showMetadata: boolean;
  verificationStatus: 'verified' | 'unverified' | 'checking';
}

// Action tracking
export interface ActionState {
  actionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedTo?: string;
  completedAt?: Date;
  notes?: string;
}

// Playbook execution UI state
export interface PlaybookUIState {
  currentStep: number;
  expandedSteps: Set<number>;
  actionStates: Map<string, ActionState>;
  slaStatus: 'compliant' | 'at_risk' | 'breached';
}

// API client response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

// Notification types
export interface SecurityNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  incident?: SecurityIncident;
  autoClose?: boolean;
}

// Chart/visualization data
export interface TimelineChartData {
  timestamp: Date;
  eventCount: number;
  severity: number;
  eventType: string;
}

export interface SeverityDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

// Component props interfaces
export interface CommanderChatProps {
  className?: string;
  onInvestigationCreated?: (investigation: Investigation) => void;
  initialQuery?: string;
}

export interface InvestigationViewerProps {
  investigationId: string;
  onClose?: () => void;
  className?: string;
}

export interface TimelineViewProps {
  events: SecurityEvent[];
  incidents?: SecurityIncident[];
  onEventSelect?: (event: SecurityEvent) => void;
  onIncidentSelect?: (incident: SecurityIncident) => void;
  filter?: TimelineFilter;
  className?: string;
}

export interface EvidenceGalleryProps {
  evidence: Evidence[];
  onEvidenceSelect?: (evidence: Evidence) => void;
  className?: string;
}

export interface IncidentCardProps {
  incident: SecurityIncident;
  expanded?: boolean;
  onToggle?: () => void;
  onInvestigate?: () => void;
  className?: string;
}

export interface PlaybookExecutionProps {
  playbookId: string;
  executionId?: string;
  onActionComplete?: (actionId: string) => void;
  className?: string;
}

export interface ActionChecklistProps {
  actions: RecommendedAction[];
  onActionUpdate?: (actionId: string, state: ActionState) => void;
  className?: string;
}

// Utility types
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';
export type ConfidenceLevel = 'very_high' | 'high' | 'medium' | 'low';
