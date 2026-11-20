/* eslint-disable -- local Node audit script (CommonJS), not app code */
// te/hi values that still contain English phrases (3+ Latin words outside placeholders): node .context/latin-audit.cjs <repo> <rev>
const { execSync } = require("child_process");
const [repo, rev] = process.argv.slice(2);
const sh = c => execSync(c, { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 });
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) typeof v === "object" && v ? flat(v, p + k + ".", out) : (out[p + k] = String(v)); return out; };
const ALLOWED = /SureCure Visit|SureCure|WhatsApp|Google|UPI|PIN|OTP|SMS|PDF|QR|ID|URL|IST|SYN-|SCV-|Razorpay|Aadhaar|ABHA|Telugu|Hindi|English|en-IN|TRAI|DLT|CBC|ECG|BP|HbA1c|TSH|ENT/g;
const files = sh(`git ls-tree -r --name-only ${rev} -- src/messages/en`).split("\n").filter(f => f.endsWith(".json")).map(f => f.replace("src/messages/en/", "").replace(".json", ""));
let n = 0;
for (const ns of files) for (const l of ["te", "hi"]) {
  let m; try { m = flat(JSON.parse(sh(`git show ${rev}:src/messages/${l}/${ns}.json`))); } catch { continue; }
  for (const [k, v] of Object.entries(m)) {
    const text = v.replace(/\{[^{}]*\}/g, " ").replace(/\{[^{}]*\{[^{}]*\}[^{}]*\}/g, " ").replace(ALLOWED, " ").replace(/<[^>]+>/g, " ");
    const run = text.match(/[A-Za-z]{2,}(?:[ \-'][A-Za-z]{2,}){2,}/);
    if (run && !/[\u0900-\u097F\u0C00-\u0C7F]/.test(text.replace(run[0], ""))) { console.log(`${l}:${ns}.${k} = ${v.slice(0, 120)}`); n++; }
    else if (run) { console.log(`${l}:${ns}.${k} (mixed) = "${run[0]}"`); n++; }
  }
}
console.log(`hits=${n}`);
