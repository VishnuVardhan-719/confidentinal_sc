/* eslint-disable -- local Node audit script (CommonJS), not app code */
// Per module: /api paths the http adapter calls, and methods that fail("gated"). node .context/adapter-map.cjs <srcDir>
const fs = require("fs"), path = require("path");
const SRC = path.resolve(process.argv[2]);
const walk = d => fs.readdirSync(d).flatMap(n => { const f = path.join(d, n); return fs.statSync(f).isDirectory() ? walk(f) : [f]; });
const mods = path.join(SRC, "modules");
for (const m of fs.readdirSync(mods).sort()) {
  const dir = path.join(mods, m);
  if (!fs.statSync(dir).isDirectory()) continue;
  const files = walk(dir).filter(f => /http|api|client|server-actions|actions|session|index/.test(path.basename(f)) && /\.tsx?$/.test(f) && !/fixture/.test(path.basename(f)));
  const paths = new Set(), gated = new Set(), methods = new Set();
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    for (const x of t.matchAll(/[`"'](\/api\/[^`"'\s]*)[`"']/g)) paths.add(x[1].replace(/\$\{[^}]+\}/g, ":id"));
    for (const x of t.matchAll(/\bmethod:\s*"(GET|POST|PATCH|PUT|DELETE)"/g)) methods.add(x[1]);
    // name: async (...) => fail("gated")  |  async name(...) { ... return fail("gated")
    for (const x of t.matchAll(/(\w+)\s*:\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>\s*(?:\{[^}]*?)?fail\("gated"\)/g)) gated.add(x[1]);
    for (const x of t.matchAll(/async\s+(\w+)\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*\n\s*)*return fail\("gated"\)/g)) gated.add(x[1]);
    if (/const gated = |gatedApi|allGated|=> gated\b/.test(t)) gated.add("(helper: all/most methods gated)");
  }
  if (!paths.size && !gated.size) continue;
  console.log(`## ${m}`);
  if (paths.size) console.log(`  paths: ${[...paths].sort().join("  ")}`);
  if (gated.size) console.log(`  gated: ${[...gated].sort().join(", ")}`);
}
