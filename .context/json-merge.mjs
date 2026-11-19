// Deep-merge message JSON from git stages: ours (:2) + theirs (:3). Reports leaf conflicts.
// Usage: node .context/json-merge.mjs <prefer: ours|theirs> <file...>
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const [prefer, ...files] = process.argv.slice(2);
const show = (stage, f) => JSON.parse(execFileSync("git", ["show", `:${stage}:${f}`], { encoding: "utf8" }));
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(a, b, path, conflicts) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in a)) out[k] = v;
    else if (isObj(a[k]) && isObj(v)) out[k] = merge(a[k], v, p, conflicts);
    else if (JSON.stringify(a[k]) !== JSON.stringify(v)) {
      conflicts.push(p);
      out[k] = prefer === "theirs" ? v : a[k];
    }
  }
  return out;
}
for (const f of files) {
  const conflicts = [];
  const merged = merge(show(2, f), show(3, f), "", conflicts);
  writeFileSync(f, JSON.stringify(merged, null, 2) + "\n");
  console.log(f, "leaf conflicts:", conflicts.length, conflicts.slice(0, 40).join(", "));
}
