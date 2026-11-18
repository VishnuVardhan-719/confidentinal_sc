// One-off: copy the import closure of fe2-c's bookings/patient modules into fe2-d, byte-identical.
// Usage: node .context/vendor-fe2c.mjs [--write]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix } from "node:path";

const REF = "feat/fe2-c";
const seeds = ["src/modules/bookings/server-loaders.ts", "src/modules/bookings/api.ts", "src/modules/bookings/status.ts", "src/modules/patient/api.ts", "src/modules/patient/readiness.ts", "src/modules/payments/api.ts", "src/modules/payments/status.ts"];
const tree = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", REF, "--", "src"], { encoding: "utf8" }).split("\n").filter(Boolean));
const show = (p) => execFileSync("git", ["show", `${REF}:${p}`]);
const resolve = (from, spec) => {
  const base = spec.startsWith("@/") ? "src/" + spec.slice(2) : posix.normalize(posix.join(posix.dirname(from), spec));
  for (const c of [base, base + ".ts", base + ".tsx", base + "/index.ts", base + ".json"]) if (tree.has(c)) return c;
  return null;
};
const seen = new Set();
const queue = [...seeds];
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  if (!/\.tsx?$/.test(f)) continue;
  const src = show(f).toString("utf8");
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"(@\/[^"]+|\.{1,2}\/[^"]*)"/g)) {
    const r = resolve(f, m[1]);
    if (r) queue.push(r);
    else console.warn("unresolved", f, m[1]);
  }
}
const write = process.argv.includes("--write");
for (const f of [...seen].sort()) {
  const blob = show(f);
  const status = !existsSync(f) ? "NEW" : Buffer.compare(readFileSync(f), blob) === 0 ? "same" : "DIFFERS";
  if (status === "same" || status === "DIFFERS") { if (status === "DIFFERS") console.log("DIFFERS (not written)", f); continue; }
  console.log(status, f);
  if (write) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, blob); }
}
