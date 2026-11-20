/* eslint-disable -- local Node audit script (CommonJS), not app code */
const { execSync } = require("child_process");
const [repo, rev, ...nsList] = process.argv.slice(2);
const sh = c => execSync(c, { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 });
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) typeof v === "object" && v ? flat(v, p + k + ".", out) : (out[p + k] = String(v)); return out; };
const ph = s => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map(m => m[1]).sort().join(",");
const files = sh(`git ls-tree -r --name-only ${rev} -- src/messages/en`).split("\n").filter(f => f.endsWith(".json")).map(f => f.replace("src/messages/en/", "").replace(".json", ""));
for (const ns of nsList.length ? nsList : files) {
  const load = l => { try { return flat(JSON.parse(sh(`git show ${rev}:src/messages/${l}/${ns}.json`))); } catch { return null; } };
  const en = load("en");
  for (const l of ["te", "hi"]) { const o = load(l); if (!o) { console.log(ns, l, "MISSING FILE"); continue; }
    const miss = Object.keys(en).filter(k => !(k in o)), extra = Object.keys(o).filter(k => !(k in en));
    const copied = Object.keys(o).filter(k => o[k] === en[k] && /[A-Za-z]{3}/.test(en[k].replace(/\{[^}]*\}/g, "")));
    const phm = Object.keys(o).filter(k => k in en && ph(o[k]) !== ph(en[k]));
    const hi0 = l === "hi" ? Object.entries(o).filter(([, v]) => /plural/.test(v) && !/=0\s*\{/.test(v) && /\bone\s*\{[^}#]*\}/.test(v)).map(([k]) => k) : [];
    console.log(`${ns}/${l}: missing=${miss.length} ${miss.slice(0,5)} extra=${extra.length} ${extra.slice(0,5)} copied=${copied.length} ${copied.slice(0,5)} placeholderDiff=${phm.length} ${phm.slice(0,5)} hiOneNoHash=${hi0.length} ${hi0}`); }
}
