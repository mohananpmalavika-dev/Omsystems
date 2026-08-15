import type {
  ProbeContext,
  ProbeEvidence,
  RecorderProbe,
} from "./recorder-probe.interface.js";

interface HttpObservation {
  url: string;
  server: string | null;
  realm: string | null;
  status: number;
  bodyHints: string[];
  latencyMs: number;
}

export class HttpIdentityProbe implements RecorderProbe {
  readonly id = "http-identity-probe";
  readonly cost = 1;
  readonly apiFamily = "HTTP" as const;

  async run(ctx: ProbeContext): Promise<ProbeEvidence> {
    const started = Date.now();
    const pathsToProbe = ["/", "/login.html", "/web/login.html", "/doc/page/login.asp"];
    const observations: HttpObservation[] = [];

    const ports = ctx.httpPorts.length ? ctx.httpPorts : [ctx.port];

    for (const port of ports) {
      if (ctx.abortSignal.aborted) break;
      const base = `${ctx.secure ? "https" : "http"}://${ctx.host}:${port}`;

      for (const p of pathsToProbe) {
        if (ctx.abortSignal.aborted) break;
        const probeStart = Date.now();
        const targetUrl = `${base}${p}`;

        try {
          const res = await fetch(targetUrl, {
            method: "GET",
            signal: ctx.abortSignal,
            redirect: "follow",
          });

          const server = res.headers.get("server");
          const authHeader = res.headers.get("www-authenticate");
          const realm = parseWwwAuthenticateRealm(authHeader);
          let bodyText = "";
          try {
            bodyText = (await res.text()).slice(0, 4096);
          } catch {
            // ignore
          }

          const bodyHints = extractNonSecretBodyHints(bodyText);

          observations.push({
            url: targetUrl,
            server,
            realm,
            status: res.status,
            bodyHints,
            latencyMs: Date.now() - probeStart,
          });

          // Early break if we found strong match
          if (bodyHints.length >= 2 || (server && server.toLowerCase().includes("dahua"))) {
            break;
          }
        } catch {
          observations.push({
            url: targetUrl,
            server: null,
            realm: null,
            status: 0,
            bodyHints: [],
            latencyMs: Date.now() - probeStart,
          });
        }
      }
    }

    return classifyHttpObservations(observations, started);
  }
}

function parseWwwAuthenticateRealm(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/realm="?([^",]+)"?/i);
  return match && match[1] ? match[1] : null;
}

function extractNonSecretBodyHints(body: string): string[] {
  const hints: string[] = [];
  if (!body) return hints;

  const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    hints.push(`title:${titleMatch[1].trim()}`);
  }

  if (/cp[\s-]*plus/i.test(body)) hints.push("brand:CP PLUS");
  if (/dahua/i.test(body)) hints.push("brand:Dahua");
  if (/hikvision/i.test(body)) hints.push("brand:Hikvision");
  if (/uniview|unv/i.test(body)) hints.push("brand:Uniview");
  if (/web\s*service\s*version/i.test(body)) hints.push("signature:web_service");
  if (/gopview|quickview|nvr|dvr/i.test(body)) hints.push("signature:recorder_ui");

  return hints;
}

function classifyHttpObservations(observations: HttpObservation[], started: number): ProbeEvidence {
  const allHints = observations.flatMap((o) => o.bodyHints);
  const servers = observations.map((o) => o.server).filter(Boolean);
  const realms = observations.map((o) => o.realm).filter(Boolean);
  const totalLatency = Date.now() - started;

  let manufacturer: string | undefined;
  let model: string | undefined;
  let outcome: "MATCH" | "NO_MATCH" | "AUTH_REQUIRED" | "INCONCLUSIVE" | "ERROR" = "INCONCLUSIVE";
  let confidence = 0.2;

  const textCorpus = `${allHints.join(" ")} ${servers.join(" ")} ${realms.join(" ")}`.toLowerCase();

  if (textCorpus.includes("cp plus") || textCorpus.includes("cp-plus") || textCorpus.includes("cpplus")) {
    manufacturer = "CP PLUS";
    outcome = "MATCH";
    confidence = 0.65;
  } else if (textCorpus.includes("dahua") || textCorpus.includes("dh-")) {
    manufacturer = "Dahua";
    outcome = "MATCH";
    confidence = 0.60;
  } else if (textCorpus.includes("hikvision") || textCorpus.includes("hik-")) {
    manufacturer = "Hikvision";
    outcome = "MATCH";
    confidence = 0.60;
  } else if (textCorpus.includes("uniview") || textCorpus.includes("unv")) {
    manufacturer = "Uniview";
    outcome = "MATCH";
    confidence = 0.55;
  } else if (observations.some((o) => o.status === 401 || o.status === 403)) {
    outcome = "AUTH_REQUIRED";
    confidence = 0.35;
  } else if (observations.some((o) => o.status > 0)) {
    outcome = "INCONCLUSIVE";
    confidence = 0.25;
  } else {
    outcome = "ERROR";
    confidence = 0.05;
  }

  return {
    apiFamily: "HTTP",
    probeId: "http-identity-probe",
    outcome,
    confidence,
    identity: manufacturer ? { manufacturer, model } : undefined,
    capabilities: {
      deviceInfo: outcome === "MATCH" ? "PARTIAL" : "UNKNOWN",
    },
    metadata: {
      servers,
      realms,
      hintsCount: allHints.length,
    },
    latencyMs: totalLatency,
    observedAt: new Date().toISOString(),
  };
}
