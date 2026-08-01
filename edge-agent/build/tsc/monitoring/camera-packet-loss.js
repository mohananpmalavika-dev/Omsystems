import { spawn } from "node:child_process";
/** Measures ICMP loss between the edge appliance and the camera host. */
export async function measureCameraPacketLoss(streamUri, attempts = 3, timeoutMs = 1_000) {
    let host;
    try {
        host = new URL(streamUri).hostname;
    }
    catch {
        return null;
    }
    if (!host)
        return null;
    const safeAttempts = Math.max(1, Math.min(10, attempts));
    const args = process.platform === "win32"
        ? ["-n", String(safeAttempts), "-w", String(timeoutMs), host]
        : ["-c", String(safeAttempts), "-W", String(Math.max(1, Math.ceil(timeoutMs / 1_000))), host];
    return new Promise((resolve) => {
        const child = spawn("ping", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        const timeout = setTimeout(() => {
            child.kill();
            resolve(null);
        }, safeAttempts * timeoutMs + 2_000);
        child.stdout.on("data", (chunk) => { output += chunk.toString(); });
        child.stderr.on("data", (chunk) => { output += chunk.toString(); });
        child.on("error", () => {
            clearTimeout(timeout);
            resolve(null);
        });
        child.on("close", () => {
            clearTimeout(timeout);
            resolve(parseIcmpPacketLoss(output));
        });
    });
}
export function parseIcmpPacketLoss(output) {
    const windows = output.match(/\(([\d.,]+)%\s*loss\)/i);
    const posix = output.match(/([\d.,]+)%\s*packet\s*loss/i);
    const value = windows?.[1] ?? posix?.[1];
    if (!value)
        return null;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}
