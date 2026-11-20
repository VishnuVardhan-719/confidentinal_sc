/* eslint-disable -- local Node audit script (CommonJS), not app code */
const fs = require("fs"), path = require("path");
const dir = "src/messages/hi";
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) typeof v === "object" && v ? flat(v, p + k + ".", out) : (out[p + k] = String(v)); return out; };
for (const f of fs.readdirSync(dir)) { const m = flat(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  for (const [k, v] of Object.entries(m)) if (/plural/.test(v)) console.log(f, k, "=>", v); }
