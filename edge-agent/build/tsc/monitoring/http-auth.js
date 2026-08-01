import { createHash, randomBytes } from "node:crypto";
export async function authenticatedFetch(url, init, credentials, timeoutMs) {
    const headers = new Headers(init.headers);
    const first = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    const challenge = first.headers.get("www-authenticate");
    if (first.status !== 401 || !credentials || !challenge)
        return first;
    if (challenge.toLowerCase().startsWith("basic")) {
        await first.body?.cancel();
        headers.set("authorization", `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`);
        return fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    }
    if (!challenge.toLowerCase().startsWith("digest "))
        return first;
    const values = parseDigestChallenge(challenge);
    if (!values.realm || !values.nonce)
        return first;
    const parsed = new URL(url);
    const uri = `${parsed.pathname}${parsed.search}`;
    const method = (init.method ?? "GET").toUpperCase();
    const cnonce = randomBytes(8).toString("hex");
    const nc = "00000001";
    const qop = values.qop?.split(",").map((item) => item.trim()).find((item) => item === "auth");
    const ha1 = md5(`${credentials.username}:${values.realm}:${credentials.password}`);
    const ha2 = md5(`${method}:${uri}`);
    const response = qop ? md5(`${ha1}:${values.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${values.nonce}:${ha2}`);
    const parts = [
        `username="${credentials.username}"`, `realm="${values.realm}"`, `nonce="${values.nonce}"`,
        `uri="${uri}"`, `response="${response}"`, `algorithm=${values.algorithm ?? "MD5"}`,
        ...(values.opaque ? [`opaque="${values.opaque}"`] : []),
        ...(qop ? [`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []),
    ];
    await first.body?.cancel();
    headers.set("authorization", `Digest ${parts.join(", ")}`);
    return fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
}
function parseDigestChallenge(value) {
    const result = {};
    for (const match of value.slice(7).matchAll(/([a-z0-9_-]+)=(?:"([^"]*)"|([^,\s]+))/gi))
        result[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
    return result;
}
function md5(value) { return createHash("md5").update(value).digest("hex"); }
