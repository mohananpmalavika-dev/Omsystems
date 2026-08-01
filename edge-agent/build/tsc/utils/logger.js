import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
function write(level, message, context) {
    const payload = context ? ` ${JSON.stringify(context)}` : "";
    const line = `${new Date().toISOString()} [edge-agent] [${level}] ${message}${payload}`;
    writeFileLine(line);
    if (level === "error")
        console.error(line);
    else if (level === "warn")
        console.warn(line);
    else if (level === "debug")
        console.debug(line);
    else
        console.info(line);
}
function writeFileLine(line) {
    try {
        const configured = process.env.EDGE_LOG_PATH || "./logs/edge-agent.log";
        const path = resolve(configured);
        mkdirSync(dirname(path), { recursive: true });
        if (existsSync(path) && statSync(path).size > 10 * 1024 * 1024) {
            const rotated = `${path}.1`;
            try {
                renameSync(path, rotated);
            }
            catch { /* another process may be rotating */ }
        }
        appendFileSync(path, `${line}\n`, "utf8");
    }
    catch {
        // Logging must never terminate monitoring.
    }
}
export const logger = {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
};
