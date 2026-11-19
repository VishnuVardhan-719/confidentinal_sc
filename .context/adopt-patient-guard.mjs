// One-off codemod (fe-int2): interim getPatientSession() -> real fe-b guards. Prints what changed.
import { readFileSync, writeFileSync } from "node:fs";
const files = process.argv.slice(2);
for (const f of files) {
  let s = readFileSync(f, "utf8");
  const before = s;
  const isTsx = f.endsWith(".tsx");
  if (isTsx) {
    // Page guard: session + redirect -> requirePatientSession + AccessDenied.
    s = s.replace(
      /const session = getPatientSession\(\);([\s\S]*?)if \(session\.status !== "ok"\) redirect\(patientLoginRedirect\((\w+), ([^;]+?)\)\);/,
      (_m, between, loc, path) =>
        `const session = await requirePatientSession(${loc}, ${path});${between}if (session.status !== "ok") return <AccessDenied reason={session.reason} />;`,
    );
    s = s.replace(
      /if \(getPatientSession\(\)\.status !== "ok"\) redirect\(patientLoginRedirect\((\w+), ([^;]+?)\)\);/,
      (_m, loc, path) => `const session = await requirePatientSession(${loc}, ${path});\n  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;`,
    );
    if (s !== before && !s.includes("@/components/auth/access-denied")) {
      s = s.replace(/(\nimport [^\n]*\n)(?![\s\S]*\nimport )/, `$1import { AccessDenied } from "@/components/auth/access-denied";\n`);
    }
  }
  s = s.replace(/getPatientSession\(\)/g, "(await getPatientSession())");
  s = s.replace(/= \(await getPatientSession\(\)\);/g, "= await getPatientSession();");
  s = s.replace(/authorizerFor\((env|process\.env)\)/g, "authorizerFor()");
  // Import list: add requirePatientSession where used.
  if (s.includes("requirePatientSession(") && !/import \{[^}]*requirePatientSession/.test(s)) {
    s = s.replace(/import \{([^}]*)\} from "@\/modules\/patient-dashboard\/session";/, (_m, names) => `import {${names.replace(/\s*$/, "")}, requirePatientSession } from "@/modules/patient-dashboard/session";`);
  }
  if (s !== before) {
    writeFileSync(f, s);
    console.log("updated", f);
  } else console.log("UNCHANGED", f);
}
