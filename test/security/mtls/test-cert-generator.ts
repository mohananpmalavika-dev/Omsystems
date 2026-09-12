/**
 * Test Certificate & Key Generator for mTLS Security Verification
 * Generates genuine, cryptographically valid X.509 certificates using OpenSSL.
 * Zero mock data — real 2048-bit RSA keys and SHA-256 signed certs.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface GeneratedCertBundle {
  caCert: string;
  caKey: string;
  clientCert: string;
  clientKey: string;
  clientFingerprint: string;
  expiredCert: string;
  expiredKey: string;
  wrongRoleCert: string;
  wrongRoleKey: string;
}

export function getOpenSslPath(): string {
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
      "C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe",
      "C:\\OpenSSL-Win64\\bin\\openssl.exe",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return `"${c}"`;
    }
  }
  return "openssl";
}

export function generateTestCertificates(workDir: string): GeneratedCertBundle {
  mkdirSync(workDir, { recursive: true });
  const openssl = getOpenSslPath();

  // 1. Generate Root CA
  const caKeyPath = join(workDir, "ca.key");
  const caCertPath = join(workDir, "ca.crt");
  execSync(
    `${openssl} req -x509 -newkey rsa:2048 -nodes -keyout "${caKeyPath}" -out "${caCertPath}" -days 365 -subj "/CN=Sentinel-Root-CA/O=OMSystems/OU=Security"`,
    { stdio: "ignore" },
  );

  // 2. Generate Valid Edge Agent Client Cert with SANs (DNS: edge-agent-01.internal, IP: 127.0.0.1)
  const clientKeyPath = join(workDir, "client.key");
  const clientCsrPath = join(workDir, "client.csr");
  const clientCertPath = join(workDir, "client.crt");
  const clientCnfPath = join(workDir, "client.cnf");

  const cnf = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = edge-agent-01.internal
O = OMSystems
OU = EdgeAgents
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = edge-agent-01.internal
DNS.2 = localhost
IP.1 = 127.0.0.1
`;
  writeFileSync(clientCnfPath, cnf);
  execSync(`${openssl} req -newkey rsa:2048 -nodes -keyout "${clientKeyPath}" -out "${clientCsrPath}" -config "${clientCnfPath}"`, { stdio: "ignore" });
  execSync(`${openssl} x509 -req -in "${clientCsrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${clientCertPath}" -days 365 -extfile "${clientCnfPath}" -extensions v3_req`, { stdio: "ignore" });

  // 3. Generate Expired Client Cert
  const expiredKeyPath = join(workDir, "expired.key");
  const expiredCsrPath = join(workDir, "expired.csr");
  const expiredCertPath = join(workDir, "expired.crt");
  execSync(`${openssl} req -newkey rsa:2048 -nodes -keyout "${expiredKeyPath}" -out "${expiredCsrPath}" -subj "/CN=expired-agent.internal"`, { stdio: "ignore" });
  execSync(`${openssl} x509 -req -in "${expiredCsrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${expiredCertPath}" -days -30`, { stdio: "ignore" });

  // 4. Generate Media Node (different role) Client Cert (SAN: media-node-01.internal)
  const wrongKeyPath = join(workDir, "wrong.key");
  const wrongCsrPath = join(workDir, "wrong.csr");
  const wrongCertPath = join(workDir, "wrong.crt");
  const wrongCnfPath = join(workDir, "wrong.cnf");
  const wrongCnf = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = media-node-01.internal
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = media-node-01.internal
`;
  writeFileSync(wrongCnfPath, wrongCnf);
  execSync(`${openssl} req -newkey rsa:2048 -nodes -keyout "${wrongKeyPath}" -out "${wrongCsrPath}" -config "${wrongCnfPath}"`, { stdio: "ignore" });
  execSync(`${openssl} x509 -req -in "${wrongCsrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${wrongCertPath}" -days 365 -extfile "${wrongCnfPath}" -extensions v3_req`, { stdio: "ignore" });

  const clientCert = readFileSync(clientCertPath, "utf8");
  const { X509Certificate, createHash } = require("node:crypto");
  const certObj = new X509Certificate(clientCert);
  const clientFingerprint = createHash("sha256").update(certObj.raw).digest("hex").toLowerCase();

  return {
    caCert: readFileSync(caCertPath, "utf8"),
    caKey: readFileSync(caKeyPath, "utf8"),
    clientCert,
    clientKey: readFileSync(clientKeyPath, "utf8"),
    clientFingerprint,
    expiredCert: readFileSync(expiredCertPath, "utf8"),
    expiredKey: readFileSync(expiredKeyPath, "utf8"),
    wrongRoleCert: readFileSync(wrongCertPath, "utf8"),
    wrongRoleKey: readFileSync(wrongKeyPath, "utf8"),
  };
}
