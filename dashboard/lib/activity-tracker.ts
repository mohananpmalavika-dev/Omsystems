/**
 * Activity Tracker
 * Automatically tracks user activity including sessions, page visits, and actions
 */

interface ActivitySession {
  sessionId: string;
  startTime: Date;
}

interface PageVisit {
  pageVisitId: string;
  pagePath: string;
  startTime: Date;
  clickCount: number;
  maxScrollDepth: number;
  formInteractions: number;
  isActive: boolean;
}

interface ActivityTrackerConfig {
  apiBaseUrl: string;
  heartbeatInterval?: number; // milliseconds
  idleThreshold?: number; // milliseconds
  enableDebugLogs?: boolean;
}

class ActivityTracker {
  private config: Required<ActivityTrackerConfig>;
  private session: ActivitySession | null = null;
  private currentPageVisit: PageVisit | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private lastActivityTime: Date = new Date();
  private isIdle: boolean = false;
  private activeTimeStart: Date = new Date();
  private totalActiveTime: number = 0;
  private totalIdleTime: number = 0;

  constructor(config: ActivityTrackerConfig) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl,
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      idleThreshold: config.idleThreshold || 120000, // 2 minutes
      enableDebugLogs: config.enableDebugLogs || false,
    };
  }

  private log(...args: any[]) {
    if (this.config.enableDebugLogs) {
      console.log('[ActivityTracker]', ...args);
    }
  }


  /**
   * Initialize activity tracking
   */
  async initialize() {
    if (typeof window === 'undefined') return; // SSR guard

    // Set up activity listeners
    this.setupActivityListeners();

    // Set up page visibility listener
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    // Set up beforeunload to save data before leaving
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));

    this.log('Activity tracker initialized');
  }

  /**
   * Start a new session (call on login)
   */
  async startSession(userId: string, accessToken: string) {
    try {
      const deviceInfo = this.getDeviceInfo();
      
      const response = await fetch(`${this.config.apiBaseUrl}/v1/activity/sessions/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ deviceInfo }),
      });

      if (!response.ok) {
        throw new Error('Failed to start session');
      }

      const data = await response.json();
      this.session = {
        sessionId: data.sessionId,
        startTime: new Date(),
      };

      // Start heartbeat
      this.startHeartbeat(accessToken);

      this.log('Session started:', this.session.sessionId);
      
      // Store in sessionStorage for recovery
      sessionStorage.setItem('activitySessionId', this.session.sessionId);
      sessionStorage.setItem('activityAccessToken', accessToken);

      return this.session.sessionId;
    } catch (error) {
      console.error('Error starting activity session:', error);
      return null;
    }
  }

  /**
   * End the current session (call on logout)
   */
  async endSession(accessToken?: string) {
    if (!this.session) return;

    try {
      // End current page visit first
      await this.endPageVisit(accessToken);

      const token = accessToken || sessionStorage.getItem('activityAccessToken');
      if (!token) return;

      await fetch(`${this.config.apiBaseUrl}/v1/activity/sessions/${this.session.sessionId}/end`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      this.log('Session ended:', this.session.sessionId);
    } catch (error) {
      console.error('Error ending session:', error);
    } finally {
      this.stopHeartbeat();
      this.session = null;
      sessionStorage.removeItem('activitySessionId');
      sessionStorage.removeItem('activityAccessToken');
    }
  }


  /**
   * Track page visit
   */
  async trackPageVisit(pagePath: string, pageTitle: string, pageModule: string, pageCategory?: string, referrerPath?: string) {
    if (!this.session) {
      this.log('No active session, skipping page visit tracking');
      return;
    }

    // End previous page visit
    await this.endPageVisit();

    try {
      const accessToken = sessionStorage.getItem('activityAccessToken');
      if (!accessToken) return;

      const queryParameters = this.getQueryParameters();

      const response = await fetch(`${this.config.apiBaseUrl}/v1/activity/page-visits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId: this.session.sessionId,
          pagePath,
          pageTitle,
          pageModule,
          pageCategory,
          referrerPath,
          queryParameters,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to track page visit');
      }

      const data = await response.json();
      
      this.currentPageVisit = {
        pageVisitId: data.pageVisitId,
        pagePath,
        startTime: new Date(),
        clickCount: 0,
        maxScrollDepth: 0,
        formInteractions: 0,
        isActive: true,
      };

      // Reset timers
      this.activeTimeStart = new Date();
      this.totalActiveTime = 0;
      this.totalIdleTime = 0;
      this.isIdle = false;
      this.resetIdleTimer();

      this.log('Page visit tracked:', pagePath);

      // Store current page visit ID
      sessionStorage.setItem('currentPageVisitId', data.pageVisitId);

      return data.pageVisitId;
    } catch (error) {
      console.error('Error tracking page visit:', error);
      return null;
    }
  }

  /**
   * End current page visit
   */
  async endPageVisit(accessToken?: string) {
    if (!this.currentPageVisit) return;

    try {
      const token = accessToken || sessionStorage.getItem('activityAccessToken');
      if (!token) return;

      const durationSeconds = Math.floor((new Date().getTime() - this.currentPageVisit.startTime.getTime()) / 1000);
      
      // Update active/idle time
      if (!this.isIdle) {
        this.totalActiveTime += Math.floor((new Date().getTime() - this.activeTimeStart.getTime()) / 1000);
      }

      await fetch(`${this.config.apiBaseUrl}/v1/activity/page-visits/${this.currentPageVisit.pageVisitId}/end`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          pageVisitId: this.currentPageVisit.pageVisitId,
          durationSeconds,
          activeTimeSeconds: this.totalActiveTime,
          idleTimeSeconds: this.totalIdleTime,
          clickCount: this.currentPageVisit.clickCount,
          scrollDepthPercentage: this.currentPageVisit.maxScrollDepth,
          formInteractionsCount: this.currentPageVisit.formInteractions,
        }),
      });

      this.log('Page visit ended:', this.currentPageVisit.pagePath, `${durationSeconds}s`);
    } catch (error) {
      console.error('Error ending page visit:', error);
    } finally {
      sessionStorage.removeItem('currentPageVisitId');
      this.currentPageVisit = null;
    }
  }


  /**
   * Track user action
   */
  async trackAction(
    actionType: string,
    actionCategory: string,
    moduleName: string,
    options?: {
      actionTarget?: string;
      actionDescription?: string;
      featureName?: string;
      actionMetadata?: Record<string, any>;
    }
  ) {
    if (!this.session) return;

    try {
      const accessToken = sessionStorage.getItem('activityAccessToken');
      if (!accessToken) return;

      await fetch(`${this.config.apiBaseUrl}/v1/activity/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId: this.session.sessionId,
          pageVisitId: this.currentPageVisit?.pageVisitId,
          actionType,
          actionCategory,
          actionTarget: options?.actionTarget,
          actionDescription: options?.actionDescription,
          moduleName,
          featureName: options?.featureName,
          actionMetadata: options?.actionMetadata,
        }),
      });

      this.log('Action tracked:', actionType);
    } catch (error) {
      console.error('Error tracking action:', error);
    }
  }

  /**
   * Private helper methods
   */
  private setupActivityListeners() {
    // Track clicks
    document.addEventListener('click', () => {
      this.handleActivity();
      if (this.currentPageVisit) {
        this.currentPageVisit.clickCount++;
      }
    });

    // Track scroll
    let scrollTimeout: NodeJS.Timeout;
    document.addEventListener('scroll', () => {
      this.handleActivity();
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (this.currentPageVisit) {
          const scrollDepth = this.calculateScrollDepth();
          if (scrollDepth > this.currentPageVisit.maxScrollDepth) {
            this.currentPageVisit.maxScrollDepth = scrollDepth;
          }
        }
      }, 100);
    });

    // Track keyboard
    document.addEventListener('keydown', () => {
      this.handleActivity();
    });

    // Track mouse movement
    let mouseMoveTimeout: NodeJS.Timeout;
    document.addEventListener('mousemove', () => {
      clearTimeout(mouseMoveTimeout);
      mouseMoveTimeout = setTimeout(() => {
        this.handleActivity();
      }, 200);
    });

    // Track form interactions
    document.addEventListener('input', (e) => {
      this.handleActivity();
      if (this.currentPageVisit && (e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA' ||
          (e.target as HTMLElement).tagName === 'SELECT') {
        this.currentPageVisit.formInteractions++;
      }
    });
  }

  private handleActivity() {
    this.lastActivityTime = new Date();
    
    // If was idle, mark as active now
    if (this.isIdle) {
      const idleEnd = new Date();
      this.totalIdleTime += Math.floor((idleEnd.getTime() - this.activeTimeStart.getTime()) / 1000);
      this.activeTimeStart = new Date();
      this.isIdle = false;
      this.log('User became active');
    }

    this.resetIdleTimer();
  }

  private resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      if (!this.isIdle) {
        const activeEnd = new Date();
        this.totalActiveTime += Math.floor((activeEnd.getTime() - this.activeTimeStart.getTime()) / 1000);
        this.activeTimeStart = new Date();
        this.isIdle = true;
        this.log('User became idle');
      }
    }, this.config.idleThreshold);
  }


  private startHeartbeat(accessToken: string) {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      if (!this.session) return;

      try {
        await fetch(`${this.config.apiBaseUrl}/v1/activity/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            sessionId: this.session.sessionId,
          }),
        });
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private handleVisibilityChange() {
    if (document.hidden) {
      // Page hidden, pause tracking
      if (!this.isIdle) {
        const activeEnd = new Date();
        this.totalActiveTime += Math.floor((activeEnd.getTime() - this.activeTimeStart.getTime()) / 1000);
        this.isIdle = true;
      }
    } else {
      // Page visible, resume tracking
      if (this.isIdle) {
        const idleEnd = new Date();
        this.totalIdleTime += Math.floor((idleEnd.getTime() - this.activeTimeStart.getTime()) / 1000);
        this.activeTimeStart = new Date();
        this.isIdle = false;
      }
    }
  }

  private handleBeforeUnload() {
    // Synchronously end session if possible
    if (this.session && this.currentPageVisit) {
      const accessToken = sessionStorage.getItem('activityAccessToken');
      if (accessToken) {
        const durationSeconds = Math.floor((new Date().getTime() - this.currentPageVisit.startTime.getTime()) / 1000);
        
        // Update active/idle time
        if (!this.isIdle) {
          this.totalActiveTime += Math.floor((new Date().getTime() - this.activeTimeStart.getTime()) / 1000);
        }

        // Use sendBeacon for reliable transmission
        const pageVisitData = {
          pageVisitId: this.currentPageVisit.pageVisitId,
          durationSeconds,
          activeTimeSeconds: this.totalActiveTime,
          idleTimeSeconds: this.totalIdleTime,
          clickCount: this.currentPageVisit.clickCount,
          scrollDepthPercentage: this.currentPageVisit.maxScrollDepth,
          formInteractionsCount: this.currentPageVisit.formInteractions,
        };

        navigator.sendBeacon(
          `${this.config.apiBaseUrl}/v1/activity/page-visits/${this.currentPageVisit.pageVisitId}/end`,
          JSON.stringify(pageVisitData)
        );
      }
    }
  }

  private getDeviceInfo() {
    if (typeof window === 'undefined') return {};

    return {
      browser: this.getBrowserInfo(),
      os: this.getOSInfo(),
      deviceType: this.getDeviceType(),
      screenResolution: `${window.screen.width}x${window.screen.height}`,
    };
  }

  private getBrowserInfo(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private getOSInfo(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  private getDeviceType(): string {
    if (typeof window === 'undefined') return 'Unknown';
    const width = window.innerWidth;
    if (width < 768) return 'Mobile';
    if (width < 1024) return 'Tablet';
    return 'Desktop';
  }

  private calculateScrollDepth(): number {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollPercentage = (scrollTop + windowHeight) / documentHeight * 100;
    return Math.min(Math.round(scrollPercentage), 100);
  }

  private getQueryParameters(): Record<string, any> {
    if (typeof window === 'undefined') return {};
    
    const params: Record<string, any> = {};
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  /**
   * Get current session info
   */
  getSession() {
    return this.session;
  }

  /**
   * Get current page visit info
   */
  getCurrentPageVisit() {
    return this.currentPageVisit;
  }
}

// Singleton instance
let activityTrackerInstance: ActivityTracker | null = null;

export function getActivityTracker(config?: ActivityTrackerConfig): ActivityTracker {
  if (!activityTrackerInstance && config) {
    activityTrackerInstance = new ActivityTracker(config);
  }
  if (!activityTrackerInstance) {
    throw new Error('Activity tracker not initialized. Please provide config on first call.');
  }
  return activityTrackerInstance;
}

export { ActivityTracker };
export type { ActivityTrackerConfig, ActivitySession, PageVisit };
