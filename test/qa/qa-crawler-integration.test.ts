import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { QARunWorker } from "../../qa-engine/src/workers/qa-run.worker.js";
import type { QARunConfig } from "../../qa-engine/src/types/qa.types.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("QA Crawler Integration - Real Playwright Run", () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    // Start small mock web application for end-to-end audit testing
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

      // 1. Login endpoint
      if (url.pathname === "/login") {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            res.writeHead(302, {
              Location: "/dashboard",
              "Set-Cookie": "sentinel_access=session-valid-token-123; Path=/; HttpOnly",
            });
            res.end();
          });
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Login - Sentinel Grid</title></head>
            <body>
              <h1>Sentinel Grid Authentication</h1>
              <form action="/login" method="POST">
                <input type="text" name="username" id="username" placeholder="Username" />
                <input type="password" name="password" id="password" placeholder="Password" />
                <button type="submit" id="login-submit">Sign In</button>
              </form>
            </body>
          </html>
        `);
        return;
      }

      // 2. Dashboard
      if (url.pathname === "/dashboard") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Dashboard - Sentinel Grid</title></head>
            <body>
              <nav>
                <a href="/dashboard">Dashboard</a>
                <a href="/cameras">Camera Management</a>
                <a href="/error-page">Broken Link</a>
                <a href="https://external-forbidden.com">External Link</a>
              </nav>
              <main>
                <h1>Fleet Dashboard</h1>
                <p>Operational control center</p>
                <!-- Destructive action button to test safety engine -->
                <button id="danger-btn" style="color: red;">Delete Camera</button>
              </main>
              <script>
                console.error("Test console error from dashboard script");
              </script>
            </body>
          </html>
        `);
        return;
      }

      // 3. Camera Management with tabs and failed API call
      if (url.pathname === "/cameras") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Cameras - Sentinel Grid</title></head>
            <body>
              <div role="tablist">
                <button role="tab" id="tab-live" aria-selected="true">Live View</button>
                <button role="tab" id="tab-config">Settings</button>
              </div>
              <button id="fetch-api-btn" onclick="fetch('/api/cameras')">Load Live Feeds</button>
              <script>
                // Auto trigger failed API
                fetch('/api/cameras').catch(() => {});
              </script>
            </body>
          </html>
        `);
        return;
      }

      // 4. Failed API endpoint
      if (url.pathname === "/api/cameras") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Camera Pipeline Failure" }));
        return;
      }

      // 5. Broken route (404)
      if (url.pathname === "/error-page") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 Not Found</h1><p>Requested route does not exist.</p>");
        return;
      }

      // Default redirect to login
      res.writeHead(302, { Location: "/login" });
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should autonomously login, crawl pages, block destructive actions, and produce QA report", async () => {
    const runId = `int-test-${Date.now()}`;
    const config: QARunConfig = {
      id: runId,
      targetUrl: baseUrl,
      startingPath: "/login",
      username: "admin",
      password: "password123",
      userRole: "Admin",
      browser: "chromium",
      maxPages: 10,
      maxDepth: 3,
      pageTimeoutSec: 15,
      options: {
        autoDiscover: true,
        recordVideo: true,
        captureScreenshots: true,
        captureTrace: true,
        captureConsole: true,
        captureNetwork: true,
        testTabs: true,
        detectAccessibility: true,
      },
    };

    const worker = new QARunWorker(config);
    const result = await worker.execute();

    // Verify completion
    expect(result.status).toBe("COMPLETED");
    expect(result.score).toBeGreaterThan(0);

    const entities = worker.getEntities();

    // Verify pages discovered and visited
    expect(entities.pages.length).toBeGreaterThanOrEqual(2);
    const paths = entities.pages.map((p) => p.path);
    expect(paths).toContain("/dashboard");

    // Verify destructive action blocked
    const issues = entities.issues;
    const destructiveBlocked = issues.some((i) => i.category === "DESTRUCTIVE_BLOCKED");
    expect(destructiveBlocked).toBe(true);

    // Verify console error captured
    const consoleError = entities.consoleEvents.some((c) => c.message.includes("Test console error"));
    expect(consoleError).toBe(true);

    // Verify 500 API failure captured
    const apiFailure = entities.networkEvents.some((n) => n.url.includes("/api/cameras") && n.status === 500);
    expect(apiFailure).toBe(true);

    // Verify artifacts generated on disk
    const reportPath = join(process.cwd(), "qa-artifacts", `run-${runId}`, "report.html");
    expect(existsSync(reportPath)).toBe(true);
  }, 45_000); // 45s timeout for real Playwright run
});
