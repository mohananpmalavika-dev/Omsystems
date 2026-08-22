/**
 * Security Commander Context
 * Global state management for commander interface
 */

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import type {
  Investigation,
  CommanderResponse,
  SecurityIncident,
} from '../../types';
import type {
  ChatMessage,
  InvestigationViewState,
  SecurityNotification,
  ApiResponse,
} from '../types/ui-types';

// State interface
interface CommanderState {
  messages: ChatMessage[];
  activeInvestigation?: Investigation;
  investigations: Investigation[];
  viewState: InvestigationViewState;
  notifications: SecurityNotification[];
  isConnected: boolean;
  llmAvailable: boolean;
}

// Action types
type CommanderAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } }
  | { type: 'SET_ACTIVE_INVESTIGATION'; payload: Investigation }
  | { type: 'CLEAR_ACTIVE_INVESTIGATION' }
  | { type: 'ADD_INVESTIGATION'; payload: Investigation }
  | { type: 'UPDATE_VIEW_STATE'; payload: Partial<InvestigationViewState> }
  | { type: 'ADD_NOTIFICATION'; payload: SecurityNotification }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'SET_CONNECTION_STATUS'; payload: { isConnected: boolean; llmAvailable: boolean } }
  | { type: 'TOGGLE_SECTION'; payload: string }
  | { type: 'CLEAR_MESSAGES' };

// Initial state
const initialState: CommanderState = {
  messages: [],
  investigations: [],
  viewState: {
    expandedSections: new Set(['incidents', 'timeline']),
  },
  notifications: [],
  isConnected: true,
  llmAvailable: true,
};

// Reducer
function commanderReducer(state: CommanderState, action: CommanderAction): CommanderState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id ? { ...msg, ...action.payload.updates } : msg
        ),
      };

    case 'SET_ACTIVE_INVESTIGATION':
      return {
        ...state,
        activeInvestigation: action.payload,
        viewState: {
          ...state.viewState,
          selectedIncident: undefined,
          selectedEvent: undefined,
        },
      };

    case 'CLEAR_ACTIVE_INVESTIGATION':
      return {
        ...state,
        activeInvestigation: undefined,
        viewState: initialState.viewState,
      };

    case 'ADD_INVESTIGATION':
      return {
        ...state,
        investigations: [action.payload, ...state.investigations],
      };

    case 'UPDATE_VIEW_STATE':
      return {
        ...state,
        viewState: { ...state.viewState, ...action.payload },
      };

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };

    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.payload),
      };

    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        isConnected: action.payload.isConnected,
        llmAvailable: action.payload.llmAvailable,
      };

    case 'TOGGLE_SECTION':
      const newSections = new Set(state.viewState.expandedSections);
      if (newSections.has(action.payload)) {
        newSections.delete(action.payload);
      } else {
        newSections.add(action.payload);
      }
      return {
        ...state,
        viewState: {
          ...state.viewState,
          expandedSections: newSections,
        },
      };

    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [],
      };

    default:
      return state;
  }
}

// Context interface
interface CommanderContextValue {
  state: CommanderState;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setActiveInvestigation: (investigation: Investigation) => void;
  clearActiveInvestigation: () => void;
  addNotification: (notification: Omit<SecurityNotification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  updateViewState: (updates: Partial<InvestigationViewState>) => void;
  toggleSection: (section: string) => void;
  clearMessages: () => void;
}

// Create context
const CommanderContext = createContext<CommanderContextValue | undefined>(undefined);

// Provider component
export function CommanderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(commanderReducer, initialState);

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>): string => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullMessage: ChatMessage = {
      ...message,
      id,
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: fullMessage });
    return id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id, updates } });
  }, []);

  const setActiveInvestigation = useCallback((investigation: Investigation) => {
    dispatch({ type: 'SET_ACTIVE_INVESTIGATION', payload: investigation });
    dispatch({ type: 'ADD_INVESTIGATION', payload: investigation });
  }, []);

  const clearActiveInvestigation = useCallback(() => {
    dispatch({ type: 'CLEAR_ACTIVE_INVESTIGATION' });
  }, []);

  const addNotification = useCallback((notification: Omit<SecurityNotification, 'id' | 'timestamp'>) => {
    const id = `notif_${Date.now()}`;
    const fullNotification: SecurityNotification = {
      ...notification,
      id,
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_NOTIFICATION', payload: fullNotification });

    // Auto-remove after 5 seconds if autoClose is true
    if (notification.autoClose !== false) {
      setTimeout(() => {
        dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
      }, 5000);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  }, []);

  const updateViewState = useCallback((updates: Partial<InvestigationViewState>) => {
    dispatch({ type: 'UPDATE_VIEW_STATE', payload: updates });
  }, []);

  const toggleSection = useCallback((section: string) => {
    dispatch({ type: 'TOGGLE_SECTION', payload: section });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const value: CommanderContextValue = {
    state,
    addMessage,
    updateMessage,
    setActiveInvestigation,
    clearActiveInvestigation,
    addNotification,
    removeNotification,
    updateViewState,
    toggleSection,
    clearMessages,
  };

  return <CommanderContext.Provider value={value}>{children}</CommanderContext.Provider>;
}

// Hook to use commander context
export function useCommander() {
  const context = useContext(CommanderContext);
  if (!context) {
    throw new Error('useCommander must be used within CommanderProvider');
  }
  return context;
}
