/* eslint-disable -- local Node audit script (CommonJS), not app code */
// Checks every file path and doc link in docs/frontend/HANDOVER.md exists:
//   node .context/handover-paths.cjs [integrationRepo] [integrationRev]
// Reports, per path: exists in this worktree, exists at the integration revision.
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const [intRepo = "C:/Users/Yashwanth/fe2-int", intRev = "feat/fe2-integration"] = process.argv.slice(2);
const doc = fs.readFileSync("docs/frontend/HANDOVER.md", "utf8").replace(/```[\s\S]*?```/g, "");
const found = new Set();
// Every backticked span and markdown link target, split into path-like tokens.
const spans = [...doc.matchAll(/`([^`]+)`/g)].map(m => m[1]).concat([...doc.matchAll(/\]\(([^)\s#]+)\)/g)].map(m => m[1]));
for (const span of spans) for (const raw of span.split(/[\s,]+/)) {
  // Keep Next.js route groups such as "(public)/" intact: cutting at "(" would turn a missing page into its
  // parent folder and make it pass. Only strip wrapping punctuation and a trailing call suffix like "fn()".
  let tok = raw.replace(/^["']+|["'.;:,]+$/g, "");
  if (tok.startsWith("(") && !/^\([a-z0-9-]+\)\//.test(tok)) tok = tok.slice(1);
  if (tok.endsWith(")") && !tok.includes("(")) tok = tok.slice(0, -1);
  tok = tok.replace(/\(\)$/, "");
  if (!tok || tok === "/" || /^\/?api\//.test(tok) || /^\/[a-z]{2}\//.test(tok) || /https?:|[*{}<>|=$]|\.\.\./.test(tok)) continue;
  if (/\.(tsx?|mts|mjs|cjs|md|json)$/.test(tok) || /\/$/.test(tok) || /^(src|docs|tests)\//.test(tok)) found.add(tok);
}
const PREFIXES = ["", "src/", "src/app/[locale]/", "src/modules/", "tests/e2e/", "tests/unit/", "docs/"];
const resolveLocal = p => PREFIXES.map(x => x + p).find(c => fs.existsSync(c.replace(/\/$/, "")));
/** Generic per-module file names used as a pattern ("every module has api.ts, http.ts ..."), not paths. */
const PATTERN_NAMES = new Set(["api.ts", "http.ts", "fixture.ts", "index.ts", "types.ts"]);
const candidates = [...found].filter(p => !PATTERN_NAMES.has(p));const atRev = p => PREFIXES.some(x => { try { execSync(`git cat-file -e "${intRev}:${(x + p).replace(/\/$/, "")}"`, { cwd: intRepo, stdio: "ignore" }); return true; } catch { return false; } });
let missingBoth = 0, missingLocal = 0;
const rows = [...new Set(candidates)].sort().map(p => {
  const local = resolveLocal(p) !== undefined;
  const integ = atRev(p);
  if (!local && !integ) missingBoth++;
  if (!local) missingLocal++;
  return { p, local, integ };
});
for (const r of rows) console.log(`${r.local ? "ok  " : "MISS"} ${r.integ ? "ok  " : "MISS"} ${r.p}`);
console.log(`paths=${rows.length} missingHere=${missingLocal} missingAtIntegration=${rows.filter(r => !r.integ).length} missingBoth=${missingBoth}`);
// A path must exist here or at the integration revision (new files live on the feature branch until merged).
process.exitCode = rows.some(r => !r.local && !r.integ) ? 1 : 0;
