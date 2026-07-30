import { readFile } from "node:fs/promises";
import { verifyInternetEdgeAcceptance, type InternetEdgeAcceptanceSample, type InternetEdgeAcceptanceTarget } from "./acceptance-contract.js";

const evidencePath = process.env.INTERNET_EDGE_EVIDENCE;
if (!evidencePath) {
  console.error("INTERNET_EDGE_EVIDENCE must point to a captured field-evidence JSON file");
  process.exit(1);
}

const payload = JSON.parse(await readFile(evidencePath, "utf8")) as {
  target?: Partial<InternetEdgeAcceptanceTarget>;
  samples?: InternetEdgeAcceptanceSample[];
};
const target: InternetEdgeAcceptanceTarget = {
  expectedBranches: payload.target?.expectedBranches ?? 400,
  minimumDurationHours: payload.target?.minimumDurationHours ?? 24,
  expectedFailoverBranches: payload.target?.expectedFailoverBranches ?? 10,
  minimumPathWindowSeconds: payload.target?.minimumPathWindowSeconds ?? 300,
};
const checks = verifyInternetEdgeAcceptance(payload.samples ?? [], target);
for (const check of checks) console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.details}`);
process.exitCode = checks.every((check) => check.passed) ? 0 : 1;
