/* eslint-disable -- local Node audit script (CommonJS), not app code */
const { execSync } = require("child_process");
const g = "C:/Users/Yashwanth/fe2-int";
const sh = c => execSync(c, { cwd: g, encoding: "utf8", maxBuffer: 64 << 20 });
const files = ["src/app/[locale]/doctor/actions.ts","src/app/[locale]/doctor/consultations/actions.ts","src/app/[locale]/patient/actions.ts","src/app/[locale]/patient/family/actions.ts","src/app/[locale]/patient/saved/actions.ts","src/modules/admin/admin-actions.ts","src/modules/ambulance/server-actions.ts","src/modules/caretaker/server-actions.ts","src/modules/lab/server-actions.ts","src/modules/verification/actions.ts"];
for (const f of files) {
  const t = sh(`git show "HEAD:${f}"`);
  for (const m of t.matchAll(/^(async function|function) (\w+)[\s\S]*?\n\}/gm)) {
    if (/^(api|apis|actor|run|notesApi|draftsApi|principalFor|adminAllowed|guardedApi|context|ctx|session)\w*$/.test(m[2])) {
      const body = m[0].split("\n").slice(0, 9).join("\n");
      console.log(`=== ${f} :: ${m[2]}\n${body}\n`);
    }
  }
}
