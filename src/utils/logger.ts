export const logger = {
  info: (...args: unknown[]) => console.info("[logger]", ...args),
  warn: (...args: unknown[]) => console.warn("[logger]", ...args),
  error: (...args: unknown[]) => console.error("[logger]", ...args),
  debug: (...args: unknown[]) => console.debug("[logger]", ...args),
};
