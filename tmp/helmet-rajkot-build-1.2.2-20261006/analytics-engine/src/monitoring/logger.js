/**
 * Structured Logging System for Analytics Engine
 * Provides JSON logging with log levels, context, and metadata
 */
import * as fs from 'fs';
import * as path from 'path';
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["FATAL"] = 4] = "FATAL";
})(LogLevel || (LogLevel = {}));
export class Logger {
    static instance;
    logLevel = LogLevel.INFO;
    logToFile = false;
    logFilePath;
    logStream;
    maxLogFileSize = 100 * 1024 * 1024; // 100MB
    maxLogFiles = 10;
    context = {};
    constructor() {
        // Initialize from environment variables
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        if (envLevel && envLevel in LogLevel) {
            this.logLevel = LogLevel[envLevel];
        }
        const logDir = process.env.LOG_DIR || './logs';
        if (process.env.LOG_TO_FILE === 'true') {
            this.enableFileLogging(logDir);
        }
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    /**
     * Set the minimum log level
     */
    setLogLevel(level) {
        this.logLevel = level;
    }
    /**
     * Set default context for all logs
     */
    setContext(context) {
        this.context = { ...this.context, ...context };
    }
    /**
     * Clear default context
     */
    clearContext() {
        this.context = {};
    }
    /**
     * Enable file logging
     */
    enableFileLogging(logDir) {
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
    disableFileLogging() {
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
    rotateOldLogs(logDir) {
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
        }
        catch (error) {
            console.error('Failed to rotate logs:', error);
        }
    }
    /**
     * Check if log file needs rotation
     */
    checkLogRotation() {
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
    log(level, message, context, error, metadata, component) {
        if (level < this.logLevel) {
            return;
        }
        const entry = {
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
                code: error.code
            };
        }
        const jsonLog = JSON.stringify(entry);
        // Console output (colorized for development)
        if (process.env.NODE_ENV !== 'production') {
            this.consoleLog(level, entry);
        }
        else {
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
    consoleLog(level, entry) {
        const colors = {
            [LogLevel.DEBUG]: '\x1b[36m', // Cyan
            [LogLevel.INFO]: '\x1b[32m', // Green
            [LogLevel.WARN]: '\x1b[33m', // Yellow
            [LogLevel.ERROR]: '\x1b[31m', // Red
            [LogLevel.FATAL]: '\x1b[35m' // Magenta
        };
        const reset = '\x1b[0m';
        const color = colors[level];
        const contextStr = Object.keys(entry.context || {}).length > 0
            ? ` ${JSON.stringify(entry.context)}`
            : '';
        console.log(`${color}[${entry.timestamp}] ${entry.level}${reset}: ${entry.message}${contextStr}`);
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
    debug(message, context, metadata, component) {
        this.log(LogLevel.DEBUG, message, context, undefined, metadata, component);
    }
    /**
     * Info level logging
     */
    info(message, context, metadata, component) {
        this.log(LogLevel.INFO, message, context, undefined, metadata, component);
    }
    /**
     * Warning level logging
     */
    warn(message, context, metadata, component) {
        this.log(LogLevel.WARN, message, context, undefined, metadata, component);
    }
    /**
     * Error level logging
     */
    error(message, error, context, metadata, component) {
        this.log(LogLevel.ERROR, message, context, error, metadata, component);
    }
    /**
     * Fatal level logging
     */
    fatal(message, error, context, metadata, component) {
        this.log(LogLevel.FATAL, message, context, error, metadata, component);
    }
    /**
     * Create a child logger with additional context
     */
    child(context) {
        return new ChildLogger(this, context);
    }
    /**
     * Log performance timing
     */
    time(label, context) {
        const start = Date.now();
        return () => {
            const duration = Date.now() - start;
            this.info(`${label} completed`, context, { duration });
        };
    }
    /**
     * Async performance timing wrapper
     */
    async timeAsync(label, fn, context) {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;
            this.info(`${label} completed`, context, { duration, status: 'success' });
            return result;
        }
        catch (error) {
            const duration = Date.now() - start;
            this.error(`${label} failed`, error, context, { duration, status: 'failure' });
            throw error;
        }
    }
}
/**
 * Child logger with additional context
 */
export class ChildLogger {
    parent;
    context;
    constructor(parent, context) {
        this.parent = parent;
        this.context = context;
    }
    debug(message, context, metadata, component) {
        this.parent.debug(message, { ...this.context, ...context }, metadata, component);
    }
    info(message, context, metadata, component) {
        this.parent.info(message, { ...this.context, ...context }, metadata, component);
    }
    warn(message, context, metadata, component) {
        this.parent.warn(message, { ...this.context, ...context }, metadata, component);
    }
    error(message, error, context, metadata, component) {
        this.parent.error(message, error, { ...this.context, ...context }, metadata, component);
    }
    fatal(message, error, context, metadata, component) {
        this.parent.fatal(message, error, { ...this.context, ...context }, metadata, component);
    }
    time(label, context) {
        return this.parent.time(label, { ...this.context, ...context });
    }
    async timeAsync(label, fn, context) {
        return this.parent.timeAsync(label, fn, { ...this.context, ...context });
    }
    child(context) {
        return new ChildLogger(this.parent, { ...this.context, ...context });
    }
}
// Export singleton instance
export const logger = Logger.getInstance();
// Export convenience functions
export function debug(message, context, metadata, component) {
    logger.debug(message, context, metadata, component);
}
export function info(message, context, metadata, component) {
    logger.info(message, context, metadata, component);
}
export function warn(message, context, metadata, component) {
    logger.warn(message, context, metadata, component);
}
export function error(message, err, context, metadata, component) {
    logger.error(message, err, context, metadata, component);
}
export function fatal(message, err, context, metadata, component) {
    logger.fatal(message, err, context, metadata, component);
}
export function setLogLevel(level) {
    logger.setLogLevel(level);
}
export function setContext(context) {
    logger.setContext(context);
}
export function clearContext() {
    logger.clearContext();
}
export function enableFileLogging(logDir) {
    logger.enableFileLogging(logDir);
}
export function disableFileLogging() {
    logger.disableFileLogging();
}
export function time(label, context) {
    return logger.time(label, context);
}
export async function timeAsync(label, fn, context) {
    return logger.timeAsync(label, fn, context);
}
