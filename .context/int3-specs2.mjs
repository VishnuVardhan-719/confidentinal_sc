// fe-int2 INT3: patient-bookings / patient-records -> real sign-in; guest blocks stay anonymous.
import { readFileSync, writeFileSync } from "node:fs";
const edit = (f, pairs) => {
  let s = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log("MISSING in", f, ":", a.slice(0, 80)); continue; }
    s = s.replace(a, b);
  }
  writeFileSync(f, s);
  console.log("edited", f);
};
edit("tests/e2e/patient-bookings.spec.ts", [
  [" * The interim patient session is a SERVER env var, so each mode needs its own server:\n *   session: FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_PATIENT_SESSION=self FIXTURE_BOOKING_SCENARIO=requested\n *   guest:   FRONTEND_ADAPTER=fixture APP_ENV=test (no FIXTURE_PATIENT_SESSION)\n * Run with E2E_FEP_MODE=session|guest and PLAYWRIGHT_BASE_URL pointing at that server. Without\n * E2E_FEP_MODE the suite is skipped (other agents' runs do not start this server).",
   " * Server: FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_BOOKING_SCENARIO=requested (PLAYWRIGHT_BASE_URL).\n * Signed-in tests sign in as the synthetic patient through the real fe-b guards\n * (support/fixture-session.ts); guest tests use a fresh anonymous context on the same server."],
  ['import { expect as baseExpect, test, type Page } from "@playwright/test";', 'import { expect as baseExpect, test as base, type Page } from "@playwright/test";\nimport { patientTest as test } from "./support/fixture-session";'],
  ["const MODE = process.env.E2E_FEP_MODE;\n", ""],
  ['  test.skip(MODE !== "session", "needs the session-mode fixture server");\n\n', ""],
  ['test.describe("patient bookings (guest)", () => {\n  test.skip(MODE !== "guest", "needs the guest-mode fixture server");\n\n  test("private URLs', 'base.describe("patient bookings (guest)", () => {\n  base("private URLs'],
]);
edit("tests/e2e/patient-records.spec.ts", [
  [" * The interim patient session and the clinical flag are SERVER env vars, so each mode needs its own server:\n *   clinical on:  FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_PATIENT_SESSION=self FEATURE_CLINICAL=true\n *                 run with E2E_FEP_MODE=session E2E_FEP_CLINICAL=on\n *   clinical off: FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_PATIENT_SESSION=self FIXTURE_NOTIFICATION_SCENARIO=empty\n *                 run with E2E_FEP_MODE=session E2E_FEP_CLINICAL=off\n *   guest:        FRONTEND_ADAPTER=fixture APP_ENV=test   (E2E_FEP_MODE=guest)\n * Without E2E_FEP_MODE the suite is skipped.",
   " * Signed-in tests sign in as the synthetic patient through the real fe-b guards (support/fixture-session.ts);\n * guest tests use an anonymous context. The clinical flag is a SERVER env var:\n *   clinical on:  FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true (default run)\n *   clinical off: FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_NOTIFICATION_SCENARIO=empty, run with E2E_CLINICAL=off"],
  ['import { expect as baseExpect, test, type Page } from "@playwright/test";', 'import { expect as baseExpect, test as base, type Page } from "@playwright/test";\nimport { CLINICAL_OFF, patientTest as test } from "./support/fixture-session";'],
  ["const MODE = process.env.E2E_FEP_MODE;\nconst CLINICAL = process.env.E2E_FEP_CLINICAL;\n", ""],
  ['test.skip(MODE !== "session" || CLINICAL !== "on", "needs the session-mode fixture server with FEATURE_CLINICAL=true");', 'test.skip(CLINICAL_OFF, "needs the server with FEATURE_CLINICAL=true");'],
  ['test.describe("patient records and notifications (guest)", () => {\n  test.skip(MODE !== "guest", "needs the guest-mode fixture server");\n\n  test("private URLs', 'base.describe("patient records and notifications (guest)", () => {\n  base("private URLs'],
  ['test.skip(MODE !== "session" || CLINICAL !== "off", "needs the session-mode fixture server without FEATURE_CLINICAL");', 'test.skip(!CLINICAL_OFF, "needs the server without FEATURE_CLINICAL (E2E_CLINICAL=off)");'],
]);
