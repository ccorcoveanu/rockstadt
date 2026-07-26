// Stamps a unique version into public/sw.js before each build so a new
// deploy invalidates every old service-worker cache.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(root, "scripts/sw.template.js");
const outPath = resolve(root, "public/sw.js");

let stamp;
try {
  stamp = execSync("git rev-parse --short HEAD").toString().trim() + "-" + Date.now().toString(36);
} catch {
  stamp = Date.now().toString(36);
}

const src = readFileSync(templatePath, "utf8");
const out = src.replace('const VERSION = "__SW_VERSION__";', `const VERSION = "ref-${stamp}";`);
if (out === src) throw new Error("__SW_VERSION__ placeholder not found in sw.template.js");
writeFileSync(outPath, out);
console.log(`sw.js stamped: ref-${stamp}`);
