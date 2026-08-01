import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createServer } from "node:http";
export class LocalStreamSecretStore {
    path;
    values = {};
    constructor(path) {
        this.path = path;
    }
    async load() {
        try {
            this.values = JSON.parse(await readFile(this.path, "utf8"));
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
    }
    async set(reference, sourceUri) {
        this.values[reference] = sourceUri;
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(this.path, JSON.stringify(this.values), { encoding: "utf8", mode: 0o600 });
    }
    get(reference) {
        return this.values[reference];
    }
}
export function startSecretProvider(options) {
    const server = createServer((request, response) => {
        const supplied = request.headers["x-edge-media-key"];
        if (typeof supplied !== "string" || !secureEqual(supplied, options.sharedKey)) {
            response.writeHead(401, { "content-type": "application/json" });
            return response.end('{"error":"invalid_edge_media_identity"}');
        }
        const url = new URL(request.url ?? "/", "http://localhost");
        if (request.method !== "GET" || url.pathname !== "/v1/secrets/resolve") {
            response.writeHead(404).end();
            return;
        }
        const sourceUri = options.store.get(url.searchParams.get("ref") ?? "");
        if (!sourceUri) {
            response.writeHead(404, { "content-type": "application/json" });
            return response.end('{"error":"stream_secret_unavailable"}');
        }
        response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify({ sourceUri }));
    });
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, options.host, () => resolve(server));
    });
}
function secureEqual(value, expected) {
    const supplied = Buffer.from(value);
    const configured = Buffer.from(expected);
    return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}
