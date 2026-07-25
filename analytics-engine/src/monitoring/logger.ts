/**
 * Structured Logging System for Analytics Engine
 * Provides JSON logging with log levels, context, and metadata
 */

import * as fs from 'fs';
import * as path from 'path';
import { format } from 'util';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogContext {
  cameraId?: string;
  detector?: string;
  model?: string;
  trackId?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, any>;
  duration?: number;
  component?: string;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logToFile: boolean = false;
  private logFilePath?: string;
  private logStream?: fs.WriteStream;
  private maxLogFileSize: number = 100 * 1024 * 1024; // 100MB
  private maxLogFiles: number = 10;
  private context: LogContext = {};

  private constructor() {
    // Initialize from environment variables
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      this.logLevel = LogLevel[envLevel as keyof typeof LogLevel];
    }

    const logDir = process.env.LOG_DIR || './logs';
    if (process.env.LOG_TO_FILE === 'true') {
      this.enableFileLogging(logDir);
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set the minimum log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Set default context for all logs
   */
  public setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear default context
   */
  public clearContext(): void {
    this.context = {};
  }

  /**
   * Enable file logging
   */
  public enableFileLogging(logDir: string): void {
    this.logToFile = true;
    
    // Create log directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    this.logFilePath = path.join(logDir, `analytics-${timestamp}.log`);
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

    // Rotate old logs
    this.rotateOldLogs(logDir);
  }

  /**
   * Disable file logging
   */
  public disableFileLogging(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = undefined;
    }
    this.logToFile = false;
    this.logFilePath = undefined;
  }

  /**
   * Rotate old log files
   */
  private rotateOldLogs(logDir: string): void {
    try {
      const files = fs.readdirSync(logDir)
        .filter(file => file.startsWith('analytics-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          mtime: fs.statSync(path.join(logDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // Remove old log files if exceeding max count
      if (files.length > this.maxLogFiles) {
        files.slice(this.maxLogFiles).forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      console.error('Failed to rotate logs:', error);
    }
  }

  /**
   * Check if log file needs rotation
   */
  private checkLogRotation(): void {
    if (!this.logFilePath || !fs.existsSync(this.logFilePath)) {
      return;
    }

    const stats = fs.statSync(this.logFilePath);
    if (stats.size >= this.maxLogFileSize) {
      // Close current stream
      if (this.logStream) {
        this.logStream.end();
      }

      // Create new log file
      const logDir = path.dirname(this.logFilePath);
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      this.logFilePath = path.join(logDir, `analytics-${timestamp}.log`);
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

      // Rotate old logs
      this.rotateOldLogs(logDir);
    }
  }

  /**
   * Write log entry
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error, metadata?: Record<string, any>, component?: string): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      component,
      context: { ...this.context, ...context },
      metadata
    };

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      };
    }

    const jsonLog = JSON.stringify(entry);

    // Console output (colorized for development)
    if (process.env.NODE_ENV !== 'production') {
      this.consoleLog(level, entry);
    } else {
      console.log(jsonLog);
    }

    // File output
    if (this.logToFile && this.logStream) {
      this.checkLogRotation();
      this.logStream.write(jsonLog + '\n');
    }
  }

  /**
   * Colorized console output for development
   */
  private consoleLog(level: LogLevel, entry: LogEntry): void {
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m',  // Green
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.FATAL]: '\x1b[35m'  // Magenta
    };
    const reset = '\x1b[0m';
    const color = colors[level];

    const contextStr = Object.keys(entry.context || {}).length > 0 
      ? ` ${JSON.stringify(entry.context)}` 
      : '';

    console.log(
      `${color}[${entry.timestamp}] ${entry.level}${reset}: ${entry.message}${contextStr}`
    );

    if (entry.error) {
      console.error(`${color}Error: ${entry.error.message}${reset}`);
      if (entry.error.stack) {
        console.error(entry.error.stack);
      }
    }

    if (entry.metadata) {
      console.log(`${color}Metadata:${reset}`, entry.metadata);
    }
  }

  /**
   * Debug level logging
   */
  public debug(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.log(LogLevel.DEBUG, message, context, undefined, metadata, component);
  }

  /**
   * Info level logging
   */
  public info(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.log(LogLevel.INFO, message, context, undefined, metadata, component);
  }

  /**
   * Warning level logging
   */
  public warn(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.log(LogLevel.WARN, message, context, undefined, metadata, component);
  }

  /**
   * Error level logging
   */
  public error(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.log(LogLevel.ERROR, message, context, error, metadata, component);
  }

  /**
   * Fatal level logging
   */
  public fatal(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.log(LogLevel.FATAL, message, context, error, metadata, component);
  }

  /**
   * Create a child logger with additional context
   */
  public child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }

  /**
   * Log performance timing
   */
  public time(label: string, context?: LogContext): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`${label} completed`, context, { duration });
    };
  }

  /**
   * Async performance timing wrapper
   */
  public async timeAsync<T>(label: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`${label} completed`, context, { duration, status: 'success' });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${label} failed`, error as Error, context, { duration, status: 'failure' });
      throw error;
    }
  }
}

/**
 * Child logger with additional context
 */
export class ChildLogger {
  constructor(
    private parent: Logger,
    private context: LogContext
  ) {}

  public debug(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.parent.debug(message, { ...this.context, ...context }, metadata, component);
  }

  public info(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.parent.info(message, { ...this.context, ...context }, metadata, component);
  }

  public warn(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.parent.warn(message, { ...this.context, ...context }, metadata, component);
  }

  public error(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.parent.error(message, error, { ...this.context, ...context }, metadata, component);
  }

  public fatal(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
    this.parent.fatal(message, error, { ...this.context, ...context }, metadata, component);
  }

  public time(label: string, context?: LogContext): () => void {
    return this.parent.time(label, { ...this.context, ...context });
  }

  public async timeAsync<T>(label: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
    return this.parent.timeAsync(label, fn, { ...this.context, ...context });
  }

  public child(context: LogContext): ChildLogger {
    return new ChildLogger(this.parent, { ...this.context, ...context });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export function debug(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
  logger.debug(message, context, metadata, component);
}

export function info(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
  logger.info(message, context, metadata, component);
}

export function warn(message: string, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
  logger.warn(message, context, metadata, component);
}

export function error(message: string, err?: Error, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
  logger.error(message, err, context, metadata, component);
}

export function fatal(message: string, err?: Error, context?: LogContext, metadata?: Record<string, any>, component?: string): void {
  logger.fatal(message, err, context, metadata, component);
}

export function setLogLevel(level: LogLevel): void {
  logger.setLogLevel(level);
}

export function setContext(context: LogContext): void {
  logger.setContext(context);
}

export function clearContext(): void {
  logger.clearContext();
}

export function enableFileLogging(logDir: string): void {
  logger.enableFileLogging(logDir);
}

export function disableFileLogging(): void {
  logger.disableFileLogging();
}

export function time(label: string, context?: LogContext): () => void {
  return logger.time(label, context);
}

export async function timeAsync<T>(label: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
  return logger.timeAsync(label, fn, context);
}
