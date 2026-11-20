/* eslint-disable -- local Node audit script (CommonJS), not app code */
// Role-gating audit of an exported src tree: node .context/gate-audit.cjs <srcDir>
const fs = require("fs"), path = require("path");
const SRC = path.resolve(process.argv[2]);
const walk = d => fs.readdirSync(d).flatMap(n => { const f = path.join(d, n); return fs.statSync(f).isDirectory() ? walk(f) : [f]; });
const rel = f => path.relative(SRC, f).replace(/\\/g, "/");
const files = walk(SRC).filter(f => /\.(ts|tsx)$/.test(f));
const text = new Map(files.map(f => [rel(f), fs.readFileSync(f, "utf8")]));
const AREAS = ["admin", "doctor", "lab", "ambulance", "caretaker"];
const AREA = new RegExp(`^app/\\[locale\\]/(?:\\([^)]+\\)/)*(${AREAS.join("|")})(/|$)`);
// Server-side gate calls or gate components that resolve the session on the server.
const GATE = /\b(requireRole|authorizeRole|AdminRouteGate|RouteGate|AreaRouteGate|guardDoctorPage|DoctorStaticPage|getDoctorSession|requireDoctorPage|authorizeAreaAction|authorizeOperationsSession|guardArea\w*|\w+RouteGate)\b/;
const redirectOnly = t => /\bredirect\(/.test(t) && !/<[A-Za-z]/.test(t);

function importsResolve(spec) {
  if (!spec.startsWith("@/")) return null;
  const b = path.join(SRC, spec.slice(2));
  for (const c of [b + ".tsx", b + ".ts", b + "/index.ts", b + "/index.tsx"]) if (fs.existsSync(c)) return rel(c);
  return null;
}
/** Does the file (or a component it imports from @/components) call a gate? One level deep. */
function gated(file) {
  const t = text.get(file) ?? "";
  if (GATE.test(t)) return "self";
  const bodyOnly = t.replace(/^import[^;]*;$/gm, "");
  for (const m of t.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(@\/components\/[^"]+)"/g)) {
    const f = importsResolve(m[2]);
    if (!f || !GATE.test(text.get(f) ?? "")) continue;
    // The imported name must itself be a gate (e.g. AdminRouteGate) and be used in the page body.
    const names = m[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop()).filter(n => n && GATE.test(n));
    if (names.some(n => new RegExp(`<${n}\\b|\\b${n}\\(`).test(bodyOnly))) return `via ${m[2]}`;
  }
  return null;
}
function layoutGate(file) {
  const parts = file.split("/");
  for (let n = parts.length - 1; n >= 2; n--) {
    const l = `${parts.slice(0, n).join("/")}/layout.tsx`;
    if (text.has(l) && gated(l)) return `layout ${l.replace(/^app\/\[locale\]\//, "")}`;
  }
  return null;
}

const out = { pages: [], routes: [], actions: [] };
for (const [f, t] of text) {
  if (!AREA.test(f)) continue;
  if (f.endsWith("/page.tsx")) {
    const how = gated(f) ?? layoutGate(f) ?? (redirectOnly(t) ? "redirect-only" : null);
    out.pages.push([f, how]);
  }
  if (f.endsWith("/route.ts")) out.routes.push([f, gated(f)]);
}
// Server actions: every exported async function in a "use server" file must reach a gate (directly or via a local helper).
for (const [f, t] of text) {
  if (!/^\s*["']use server["']/.test(t)) continue;
  // Function segments: from each declaration to the next one (good enough for top-level helpers and actions).
  const decl = [...t.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:^|\n)\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:<[^>]*>)?\(/g)].map(m => ({ name: m[1] ?? m[2], at: m.index }));
  const seg = new Map(decl.map((d, i) => [d.name, t.slice(d.at, decl[i + 1]?.at ?? t.length)]));
  const SESSION = /\b(getPatientSession|requirePatient\w*|getOperationsSession|authorize\w*|getDoctorSession|requireRole)\(/;
  const reaches = (name, seen = new Set()) => {
    if (seen.has(name)) return false; seen.add(name);
    const b = seg.get(name) ?? "";
    if (GATE.test(b) || SESSION.test(b)) return true;
    return [...seg.keys()].some(k => k !== name && new RegExp(`\\b${k}\\b`).test(b.slice(b.indexOf("(") + 1)) && reaches(k, seen));
  };  for (const m of t.matchAll(/export\s+async\s+function\s+(\w+)/g)) out.actions.push([f, m[1], reaches(m[1])]);
}

const missingPages = out.pages.filter(([, h]) => !h);
console.log(`pages=${out.pages.length} ungated=${missingPages.length} routes=${out.routes.length} ungatedRoutes=${out.routes.filter(([, h]) => !h).length} actions=${out.actions.length} ungatedActions=${out.actions.filter(a => !a[2]).length}`);
for (const [f] of missingPages) console.log(`UNGATED PAGE ${f}`);
for (const [f, h] of out.routes) console.log(`ROUTE ${f} ${h ?? "UNGATED"}`);
for (const [f, n, ok] of out.actions) if (!ok) console.log(`UNGATED ACTION ${f} ${n}`);
if (process.env.VERBOSE) for (const [f, h] of out.pages) console.log(`page ${f} <- ${h}`);
