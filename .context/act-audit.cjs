/* eslint-disable -- local Node audit script (CommonJS), not app code */
const { execSync } = require("child_process");
const g = "C:/Users/Yashwanth/fe2-int";
const sh = c => execSync(c, { cwd: g, encoding: "utf8", maxBuffer: 64 << 20 });
const files = sh("git ls-tree -r --name-only HEAD -- src").split("\n").filter(f => /\.tsx?$/.test(f) && !/test/.test(f));
const guardRe = /requireRole|authorizeRole|requireSession|requirePatient|getPatientSession|guarded\(|guard\(|withSession|getOperationsSession|actorFor|authorize\w*\(|getDoctorSession|doctorAction|requireDoctor|assertRole|session\(/;
for (const f of files) {
  const text = sh(`git show "HEAD:${f}"`);
  if (!/^\s*["']use server["']/m.test(text.split("\n").slice(0, 3).join("\n"))) continue;
  const fns = [...text.matchAll(/export async function (\w+)\s*\(([\s\S]*?)\n\}/g)];
  const unguarded = fns.filter(m => !guardRe.test(m[0])).map(m => m[1]);
  console.log(`${unguarded.length ? "!" : "ok"} ${f} actions=${fns.length}${unguarded.length ? " UNGUARDED: " + unguarded.join(", ") : ""}`);
}
