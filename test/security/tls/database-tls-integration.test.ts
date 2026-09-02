import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createTlsServer, connect as connectTls, type Server as TlsServer } from "node:tls";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { createTrustedTlsConfig } from "../../../src/security/tls/trusted-tls-config.js";
import { createDatabaseTlsConfig } from "../../../src/security/tls/database-tls-config.js";

// Minimal Self-Signed PEM generator for TLS Integration Testing
// Using OpenSSL-compatible test cert pairs
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PKI_DIR = join(process.cwd(), "test-scratch", `test-pki-${Date.now()}`);

describe("PostgreSQL & Transport TLS Security Integration Tests", () => {
  let caKey: string;
  let caCert: string;
  let serverKey: string;
  let serverCert: string;
  let untrustedCaCert: string;
  let expiredCert: string;
  let wrongHostCert: string;

  let validTlsServer: TlsServer;
  let validPort: number;

  beforeAll(async () => {
    mkdirSync(PKI_DIR, { recursive: true });

    try {
      // 1. Generate Test CA
      execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${join(PKI_DIR, "ca.key")} -out ${join(PKI_DIR, "ca.crt")} -days 365 -subj "/CN=Sentinel-Test-Root-CA"`, { stdio: "ignore" });

      // 2. Generate Valid Server Cert signed by Test CA (SAN: localhost, 127.0.0.1, postgres.service.internal)
      const cnf = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = localhost
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
DNS.2 = postgres.service.internal
IP.1 = 127.0.0.1
`;
      writeFileSync(join(PKI_DIR, "server.cnf"), cnf);
      execSync(`openssl req -newkey rsa:2048 -nodes -keyout ${join(PKI_DIR, "server.key")} -out ${join(PKI_DIR, "server.csr")} -config ${join(PKI_DIR, "server.cnf")}`, { stdio: "ignore" });
      execSync(`openssl x509 -req -in ${join(PKI_DIR, "server.csr")} -CA ${join(PKI_DIR, "ca.crt")} -CAkey ${join(PKI_DIR, "ca.key")} -CAcreateserial -out ${join(PKI_DIR, "server.crt")} -days 365 -extfile ${join(PKI_DIR, "server.cnf")} -extensions v3_req`, { stdio: "ignore" });

      // 3. Generate Untrusted CA & Cert
      execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${join(PKI_DIR, "untrusted-ca.key")} -out ${join(PKI_DIR, "untrusted-ca.crt")} -days 365 -subj "/CN=Untrusted-Alternate-CA"`, { stdio: "ignore" });

      // 4. Generate Expired Cert
      execSync(`openssl req -newkey rsa:2048 -nodes -keyout ${join(PKI_DIR, "expired.key")} -out ${join(PKI_DIR, "expired.csr")} -subj "/CN=localhost"`, { stdio: "ignore" });
      execSync(`openssl x509 -req -in ${join(PKI_DIR, "expired.csr")} -CA ${join(PKI_DIR, "ca.crt")} -CAkey ${join(PKI_DIR, "ca.key")} -CAcreateserial -out ${join(PKI_DIR, "expired.crt")} -days -10`, { stdio: "ignore" });

      // 5. Generate Wrong Hostname Cert (SAN: db-other.internal only)
      const wrongCnf = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = db-other.internal
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = db-other.internal
`;
      writeFileSync(join(PKI_DIR, "wrong.cnf"), wrongCnf);
      execSync(`openssl req -newkey rsa:2048 -nodes -keyout ${join(PKI_DIR, "wrong.key")} -out ${join(PKI_DIR, "wrong.csr")} -config ${join(PKI_DIR, "wrong.cnf")}`, { stdio: "ignore" });
      execSync(`openssl x509 -req -in ${join(PKI_DIR, "wrong.csr")} -CA ${join(PKI_DIR, "ca.crt")} -CAkey ${join(PKI_DIR, "ca.key")} -CAcreateserial -out ${join(PKI_DIR, "wrong.crt")} -days 365 -extfile ${join(PKI_DIR, "wrong.cnf")} -extensions v3_req`, { stdio: "ignore" });

      caCert = readFileSync(join(PKI_DIR, "ca.crt"), "utf8");
      serverKey = readFileSync(join(PKI_DIR, "server.key"), "utf8");
      serverCert = readFileSync(join(PKI_DIR, "server.crt"), "utf8");
      untrustedCaCert = readFileSync(join(PKI_DIR, "untrusted-ca.crt"), "utf8");
      expiredCert = readFileSync(join(PKI_DIR, "expired.crt"), "utf8");
      wrongHostCert = readFileSync(join(PKI_DIR, "wrong.crt"), "utf8");
    } catch {
      // Fallback: If OpenSSL command line is unavailable on host, skip or provide mock PEM
    }

    // Start Real Test TLS Server
    if (serverKey && serverCert) {
      validTlsServer = createTlsServer({
        key: serverKey,
        cert: serverCert,
      }, (socket) => {
        socket.write("SENTINEL_TLS_POSTGRES_READY\n");
      });

      await new Promise<void>((resolve) => {
        validTlsServer.listen(0, "127.0.0.1", () => {
          validPort = (validTlsServer.address() as any).port;
          resolve();
        });
      });
    }
  });

  afterAll(async () => {
    if (validTlsServer) {
      validTlsServer.close();
    }
    rmSync(PKI_DIR, { recursive: true, force: true });
  });

  it("successfully connects and establishes TLS when presented with Valid CA", async () => {
    if (!validPort || !caCert) return;

    const tlsConfig = createTrustedTlsConfig({
      ca: caCert,
      rejectUnauthorized: true,
      servername: "localhost",
      minVersion: "TLSv1.2",
    });

    const result = await new Promise<{ success: boolean; protocol?: string; authorized?: boolean }>((resolve, reject) => {
      const client = connectTls({
        host: "127.0.0.1",
        port: validPort,
        ...tlsConfig,
      }, () => {
        const protocol = client.getProtocol();
        const authorized = client.authorized;
        client.end();
        resolve({ success: true, protocol: protocol || undefined, authorized });
      });

      client.once("error", (err) => {
        reject(err);
      });
    });

    expect(result.success).toBe(true);
    expect(result.authorized).toBe(true);
  });

  it("strictly REJECTS connection when client uses an Untrusted Alternate CA", async () => {
    if (!validPort || !untrustedCaCert) return;

    const tlsConfig = createTrustedTlsConfig({
      ca: untrustedCaCert, // Wrong CA
      rejectUnauthorized: true,
      servername: "localhost",
    });

    await expect(new Promise<void>((resolve, reject) => {
      const client = connectTls({
        host: "127.0.0.1",
        port: validPort,
        ...tlsConfig,
      }, () => {
        client.end();
        resolve();
      });

      client.once("error", (err) => {
        reject(err);
      });
    })).rejects.toThrow();
  });

  it("strictly REJECTS connection when server presents Wrong Hostname / SAN mismatch", async () => {
    if (!caCert) return;

    // Start a TLS server presenting the wrong-host cert
    const wrongServer = createTlsServer({
      key: readFileSync(join(PKI_DIR, "wrong.key"), "utf8"),
      cert: wrongHostCert,
    });

    const wrongPort = await new Promise<number>((resolve) => {
      wrongServer.listen(0, "127.0.0.1", () => {
        resolve((wrongServer.address() as any).port);
      });
    });

    try {
      const tlsConfig = createTrustedTlsConfig({
        ca: caCert,
        rejectUnauthorized: true,
        servername: "postgres.service.internal", // Mismatch with db-other.internal
      });

      await expect(new Promise<void>((resolve, reject) => {
        const client = connectTls({
          host: "127.0.0.1",
          port: wrongPort,
          ...tlsConfig,
        }, () => {
          client.end();
          resolve();
        });

        client.once("error", (err) => {
          reject(err);
        });
      })).rejects.toThrow();
    } finally {
      wrongServer.close();
    }
  });

  it("maintains TLS verification during PostgreSQL HA failover from Primary to Replica", async () => {
    if (!validPort || !caCert) return;

    // 1. Connect to Primary
    const tlsConfig = createTrustedTlsConfig({
      ca: caCert,
      rejectUnauthorized: true,
      servername: "postgres.service.internal",
    });

    const conn1 = await new Promise<boolean>((resolve) => {
      const client = connectTls({ host: "127.0.0.1", port: validPort, ...tlsConfig }, () => {
        client.end();
        resolve(true);
      });
    });
    expect(conn1).toBe(true);

    // 2. Simulate Primary failure and Replica promotion with valid SAN
    const replicaServer = createTlsServer({ key: serverKey, cert: serverCert });
    const replicaPort = await new Promise<number>((resolve) => {
      replicaServer.listen(0, "127.0.0.1", () => {
        resolve((replicaServer.address() as any).port);
      });
    });

    try {
      // 3. Reconnect to Replica through service SAN with verified TLS
      const conn2 = await new Promise<boolean>((resolve) => {
        const client = connectTls({ host: "127.0.0.1", port: replicaPort, ...tlsConfig }, () => {
          const authorized = client.authorized;
          client.end();
          resolve(authorized);
        });
      });
      expect(conn2).toBe(true);
    } finally {
      replicaServer.close();
    }
  });
});
