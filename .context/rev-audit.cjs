/* eslint-disable -- local Node audit script (CommonJS), not app code */
// Read-only audit of one git revision: node .context/rev-audit.cjs <repo> <rev>
const { execSync } = require("child_process");
const [repo, rev] = process.argv.slice(2);
const sh = c => execSync(c, { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 });
const all = sh(`git ls-tree -r --name-only ${rev} -- src`).split("\n").filter(Boolean);
const cache = new Map();
const show = f => { if (!cache.has(f)) cache.set(f, sh(`git show "${rev}:${f}"`)); return cache.get(f); };
const code = all.filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts") && !f.startsWith("src/fixtures/"));
const out = { strings: [], money: [], storage: [], urls: [], noindex: [] };

for (const f of code) {
  const lines = show(f).split("\n");
  lines.forEach((line, i) => {
    const at = `${f}:${i + 1}`;
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
    if (f.endsWith(".tsx")) {
      if (/^\s+[A-Z][a-z]+( [a-zA-Z,.'-]+){2,}\s*$/.test(line)) out.strings.push(`${at}: line "${line.trim()}"`);
      for (const m of line.matchAll(/(?<![=\-])>\s*([A-Za-z][A-Za-z ,.'!?:-]{2,})\s*</g)) out.strings.push(`${at}: text "${m[1].trim()}"`);
      for (const m of line.matchAll(/\b(aria-label|title|placeholder|alt|label)="([A-Za-z][^"]{1,})"/g)) out.strings.push(`${at}: ${m[1]}="${m[2]}"`);
    }
    if (/paise|rupee|price|amount|fee/i.test(line) && /\.toFixed\(|parseFloat\(/.test(line)) out.money.push(`${at}: ${line.trim()}`);
    if (/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b|console\.(log|info|warn|error|debug)\(/.test(line)) out.storage.push(`${at}: ${line.trim()}`);
    for (const m of line.matchAll(/[?&]([a-zA-Z_]+)=/g)) out.urls.push(`${m[1]}\t${at}`);
    for (const m of line.matchAll(/searchParams\.(?:set|append)\(\s*"([a-zA-Z_]+)"/g)) out.urls.push(`${m[1]}\t${at}`);
    for (const m of line.matchAll(/new URLSearchParams\(\{([^}]*)\}/g)) for (const k of m[1].matchAll(/([a-zA-Z_]+)\s*[:,}]/g)) out.urls.push(`${k[1]}\t${at}`);
  });
}

// noindex: every page under a private area must be covered by robots index:false in the page or an ancestor layout.
const PRIVATE = /^src\/app\/\[locale\]\/(?:\([^)]+\)\/)*(patient|doctor|lab|ambulance|caretaker|admin|onboarding|account|settings)\//;
const NOINDEX = /index:\s*false|privateMetadata\(|noindex/;
const pages = all.filter(f => PRIVATE.test(f) && /\/page\.tsx$/.test(f));
for (const p of pages) {
  const parts = p.split("/");
  let covered = false;
  for (let n = parts.length - 1; n >= 3 && !covered; n--) {
    const dir = parts.slice(0, n).join("/");
    for (const name of ["page.tsx", "layout.tsx"]) {
      const f = `${dir}/${name}`;
      if ((name === "page.tsx" ? f === p : true) && all.includes(f) && NOINDEX.test(show(f))) covered = true;
    }
  }
  if (!covered) out.noindex.push(p);
}

const keys = [...new Set(out.urls.map(u => u.split("\t")[0]))].sort();
console.log(`strings=${out.strings.length} money=${out.money.length} storage=${out.storage.length} noindexMissing=${out.noindex.length}/${pages.length} urlKeys=${keys.join(",")}`);
for (const k of ["strings", "money", "storage", "noindex"]) for (const x of out[k]) console.log(`${k}: ${x}`);
if (process.env.SHOW_URLS) for (const u of out.urls) console.log(`url: ${u}`);
