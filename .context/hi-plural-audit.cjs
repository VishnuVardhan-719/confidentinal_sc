const { execSync } = require("child_process");
const g = "C:/Users/Yashwanth/fe2-int";
const sh = c => execSync(c, { cwd: g, encoding: "utf8", maxBuffer: 64 << 20 });
const files = sh("git ls-tree -r --name-only HEAD -- src/messages/hi").split("\n").filter(f => f.endsWith(".json"));
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) typeof v === "object" && v ? flat(v, p + k + ".", out) : (out[p + k] = String(v)); return out; };
for (const f of files) { const m = flat(JSON.parse(sh(`git show HEAD:${f}`)));
  for (const [k, v] of Object.entries(m)) { const re = /\{(\w+),\s*plural,([^]*)\}/; if (!/plural/.test(v)) continue;
    if (!/=0\s*\{/.test(v) && /\bone\s*\{[^}]*\b1\b/.test(v)) console.log(f.replace("src/messages/hi/",""), k, "=>", v); } }
