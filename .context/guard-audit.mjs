// Lists page/layout files under role areas and whether they reference a real guard.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const root = "src/app/[locale]";
const areas = process.argv.slice(2);
const real = /requireRole|requireOperationsSession|ops\/server|guardPatientPage|guardDoctorPage|requirePatient|authorizeRole/;
const interim = /getPatientSession|getDoctorSession|getOperationsSession/;
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/^(page|layout)\.tsx$/.test(e)) out.push(p);
  }
  return out;
}
for (const a of areas) {
  for (const f of walk(join(root, a))) {
    const s = readFileSync(f, "utf8");
    const tag = interim.test(s) ? "INTERIM" : real.test(s) ? "real" : "none";
    console.log(tag.padEnd(8), f.replaceAll("\\", "/"));
  }
}
