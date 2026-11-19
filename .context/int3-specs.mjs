// fe-int2 INT3: point e2e specs at real fixture sign-in (one-off codemod; prints what changed).
import { readFileSync, writeFileSync } from "node:fs";
const ws = ["doctor-workspace", "patient-workspace", "doctor-consultation", "proof-check"];
for (const name of ws) {
  const f = `tests/e2e/${name}.spec.ts`;
  let s = readFileSync(f, "utf8");
  const before = s;
  s = s.replace(/const test = base\.extend<\{ as: \(who: WorkspaceServer\) => Promise<Page> \}>\(\{[\s\S]*?\n\}\);\r?\n/, "// Signed in through the real fe-b guards (tests/e2e/workspace-servers.ts).\nconst test = wsTest;\n");
  s = s.replace(/import \{ wsOrigin, type WorkspaceServer \} from "\.\/workspace-servers";/, 'import { wsTest } from "./workspace-servers";');
  s = s.replace(/import \{ expect, test as base, type Page \} from "@playwright\/test";/, 'import { expect, type Page } from "@playwright/test";');
  console.log(s === before ? "UNCHANGED" : "updated", f, /base\.extend/.test(s) ? "(still has base.extend!)" : "");
  writeFileSync(f, s);
}
for (const name of ["booking-journey", "service-requests"]) {
  const f = `tests/e2e/${name}.spec.ts`;
  let s = readFileSync(f, "utf8");
  const before = s;
  s = s.replace('import { expect, test, type Locator, type Page } from "@playwright/test";', 'import { expect, type Locator, type Page } from "@playwright/test";\nimport { patientTest as test } from "./support/fixture-session";');
  s = s.replace("with the server started as FIXTURE_PATIENT_SESSION=self and a short", "signed in as the synthetic patient (support/fixture-session.ts) and a server started with a short");
  s = s.replace("synthetic fixture adapter with the server started as FIXTURE_PATIENT_SESSION=self and a short", "synthetic fixture adapter, signed in as the synthetic patient (support/fixture-session.ts), with a short");
  console.log(s === before ? "UNCHANGED" : "updated", f);
  writeFileSync(f, s);
}
