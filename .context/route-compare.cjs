/* eslint-disable -- local Node audit script (CommonJS), not app code */
// Frontend http calls (method + path) vs backend route handlers on a branch.
//   node .context/route-compare.cjs <frontendSrc> <repo> <backendRef>
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const [feSrc, repo, ref] = process.argv.slice(2);
const sh = c => execSync(c, { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 });
const norm = p => p.replace(/\?.*$/, "").replace(/\$\{[^}]+\}/g, ":id").replace(/\[[^\]]+\]/g, ":id").replace(/\/+$/, "") || "/";

// Backend: src/app/api/**/route.ts -> path + exported methods.
const backend = new Map();
for (const f of sh(`git ls-tree -r --name-only ${ref} -- src/app/api`).split("\n").filter(x => x.endsWith("/route.ts"))) {
  const route = norm(f.replace(/^src\/app/, "").replace(/\/route\.ts$/, ""));
  const text = sh(`git show "${ref}:${f}"`);
  const methods = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(m => m[1]);
  backend.set(route, methods);
}

// Frontend: every "/api/..." literal in src/modules/*/http*.ts (+ the method nearest to it).
const calls = [];
const modDir = path.join(feSrc, "modules");
for (const m of fs.readdirSync(modDir)) {
  const d = path.join(modDir, m);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter(x => /http/.test(x) && x.endsWith(".ts"))) {
    const text = fs.readFileSync(path.join(d, f), "utf8");
    for (const lit of text.matchAll(/[`"'](\/api\/[^`"'\s]*)[`"']/g)) {
      const at = lit.index;
      const lineStart = text.lastIndexOf("\n", at) + 1;
      const line = text.slice(lineStart, text.indexOf("\n", at));
      if (/^\s*(\*|\/\/)/.test(line)) continue; // comments
      const near = text.slice(Math.max(0, at - 220), at + 260);
      const method = (near.match(/method:\s*"(GET|POST|PUT|PATCH|DELETE)"/) ?? [])[1] ?? (/body:|idempotencyKey/.test(near) ? "POST?" : "GET");
      calls.push({ module: m, file: f, method, raw: lit[1], route: norm(lit[1]) });
    }
  }
}
const resolveBackend = route => {
  if (backend.has(route)) return route;
  // Prefix literals such as "/api/bookings/" + id + "/" + action.
  const prefix = route.endsWith(":id") ? route : route;
  const hits = [...backend.keys()].filter(b => b.startsWith(prefix.replace(/:id$/, "")) && b !== prefix);
  return hits.length ? hits.join(" | ") : null;
};
for (const c of calls) {
  const b = resolveBackend(c.route);
  const methods = b && backend.has(b) ? backend.get(b) : null;
  const status = !b ? "NO_ROUTE" : methods ? (methods.includes(c.method.replace("?", "")) ? "PATH+METHOD" : `METHOD? backend=${methods.join(",")}`) : "PREFIX";
  console.log(`${c.module.padEnd(16)} ${c.method.padEnd(6)} ${c.raw.padEnd(52)} ${status}${b && !backend.has(c.route) ? "  -> " + b : ""}`);
}
console.log(`backend routes on ${ref}: ${backend.size}`);
