const fs = require("fs");
const file = "/app/dist/src/security/edge-update-signing.js";
let c = fs.readFileSync(file, "utf8");
c = c.replace(
  "function normalizePem(value) {",
  `function normalizePem(value) {
    let trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        trimmed = trimmed.slice(1, -1).trim();
    }
    value = trimmed;`
);
fs.writeFileSync(file, c);
console.log("Patched successfully");
