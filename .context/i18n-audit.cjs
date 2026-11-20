const { execSync } = require("child_process");
const g = "C:/Users/Yashwanth/fe2-int";
const sh = c => execSync(c, { cwd: g, encoding: "utf8", maxBuffer: 64 << 20 });
const files = sh("git ls-tree -r --name-only HEAD -- src/messages").split("\n").filter(f => /\.json$/.test(f));
const by = {}; for (const f of files) { const [, l, n] = f.match(/src\/messages\/(\w+)\/(.+)\.json/); (by[n] ??= {})[l] = JSON.parse(sh(`git show HEAD:${f}`)); }
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) typeof v === "object" && v ? flat(v, p + k + ".", out) : (out[p + k] = String(v)); return out; };
const ph = s => [...s.matchAll(/\{(\w+)/g)].map(m => m[1]).sort().join(",");
let report = [];
for (const [ns, locs] of Object.entries(by)) {
  const en = flat(locs.en ?? {});
  for (const l of ["te", "hi"]) {
    if (!locs[l]) { report.push(`${ns}: missing ${l} file`); continue; }
    const o = flat(locs[l]);
    const missing = Object.keys(en).filter(k => !(k in o)); const extra = Object.keys(o).filter(k => !(k in en));
    const copied = Object.keys(en).filter(k => k in o && o[k] === en[k] && /[a-z]{3}/i.test(en[k]) && !/^(SureCure Visit|OK|UPI|PIN|SCV|112)/.test(en[k]));
    const badPh = Object.keys(en).filter(k => k in o && ph(o[k]) !== ph(en[k]));
    if (missing.length || extra.length || copied.length || badPh.length) report.push(`${ns}/${l}: missing=${missing.length} [${missing.slice(0,4).join(" ")}] extra=${extra.length} [${extra.slice(0,3).join(" ")}] copiedEnglish=${copied.length} [${copied.slice(0,4).join(" ")}] placeholderMismatch=${badPh.length} [${badPh.slice(0,3).join(" ")}]`);
  }
}
const ns = sh("git show HEAD:src/i18n/messages.ts"); const listed = [...ns.matchAll(/^\s+"(\w+)",$/gm)].map(m => m[1]);
report.push("namespaces in messages.ts not on disk: " + listed.filter(n => !by[n]).join(",") + " | on disk not listed: " + Object.keys(by).filter(n => !listed.includes(n)).join(","));
console.log(report.join("\n"));
