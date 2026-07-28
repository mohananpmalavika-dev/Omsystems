export interface LogContext {
  [key: string]: unknown;
}

function write(level: "debug" | "info" | "warn" | "error", message: string, context?: LogContext) {
  const payload = context ? ` ${JSON.stringify(context)}` : "";
  const line = `[edge-agent] ${message}${payload}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
