/**
 * fe-p R9-P3: every non-public provider page (doctor, lab, ambulance, caretaker) is role-gated on the
 * server by its own page, with the route that matches its URL. Pages must not rely on the layout:
 * the layout cannot see the URL, so a layout redirect sends everyone back to the dashboard.
 * Static source checks; the gate decisions themselves are covered in workspace-guards.test.ts and
 * the doctor routing tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { AMBULANCE_ROUTES } from "@/modules/ambulance/routes";
import { CARETAKER_ROUTES } from "@/modules/caretaker/routes";
import { LAB_ROUTES } from "@/modules/lab/routes";

const APP = join(process.cwd(), "src", "app", "[locale]");

function pages(area: string): { rel: string; segments: string[]; src: string }[] {
  const root = join(APP, area);
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f === "page.tsx" || f.endsWith(`${sep}page.tsx`) || f.endsWith("/page.tsx"))
    .map((f) => {
      const segments = f.split(/[\\/]/).slice(0, -1);
      return { rel: `${area}/${segments.join("/")}`, segments, src: readFileSync(join(root, f), "utf8") };
    });
}

const indexRedirect = (src: string, area: string) =>
  new RegExp(`redirect\\(\`/\\$\\{await currentLocale\\(\\)\\}/${area}/dashboard\`\\)`).test(src) ||
  new RegExp(`redirect\\(\\{ href: "/${area}/dashboard"`).test(src);

const WORKSPACE_AREAS = [
  { area: "lab", gate: "LabRouteGate", frame: "@/components/lab/lab-frame", routes: LAB_ROUTES as readonly string[] },
  { area: "ambulance", gate: "AmbulanceRouteGate", frame: "@/components/ambulance/ambulance-frame", routes: AMBULANCE_ROUTES as readonly string[] },
  { area: "caretaker", gate: "CaretakerRouteGate", frame: "@/components/caretaker/caretaker-frame", routes: CARETAKER_ROUTES as readonly string[] },
];

describe("provider pages are role-gated by the page itself", () => {
  for (const { area, gate, frame, routes } of WORKSPACE_AREAS) {
    it(`${area}: every page renders inside ${gate} with the route of its URL`, () => {
      const all = pages(area);
      expect(all.length).toBeGreaterThanOrEqual(routes.length);
      for (const p of all) {
        if (p.segments.length === 0) {
          expect(indexRedirect(p.src, area), `${p.rel}/page.tsx must redirect to the dashboard`).toBe(true);
          continue;
        }
        const m = p.src.match(new RegExp(`<${gate}\\s+route="([a-z-]+)"`));
        expect(m, `${p.rel}/page.tsx must render inside <${gate} route=...>`).not.toBeNull();
        expect(p.src).toContain(`from "${frame}"`);
        expect(routes, `${p.rel}: unknown route`).toContain(m?.[1]);
        expect(m?.[1], `${p.rel}: gate route must match the URL`).toBe(p.segments[0]);
        expect(p.src.match(new RegExp(`<${gate}\\b`, "g"))).toHaveLength(1);
      }
      // Every route in the area's route list has a page (no gate without a page, no page without a gate).
      const gated = new Set(all.filter((p) => p.segments.length > 0).map((p) => p.segments[0]));
      expect([...gated].sort()).toEqual([...routes].sort());
    });
  }

  it("doctor: every page calls guardDoctorPage with its own path and returns the denied view", () => {
    const all = pages("doctor");
    expect(all.length).toBeGreaterThanOrEqual(14);
    for (const p of all) {
      if (p.segments.length === 0) {
        expect(indexRedirect(p.src, "doctor"), `${p.rel}/page.tsx must redirect to the dashboard`).toBe(true);
        continue;
      }
      const statik = p.src.match(/<DoctorStaticPage\s+locale=\{locale\}\s+section="([a-z-]+)"/);
      if (statik) {
        expect(p.segments, `${p.rel}: static section must match the URL`).toEqual([statik[1]]);
        continue;
      }
      const call = p.src.match(/guardDoctorPage\(locale, [`"]([^`"]+)[`"]\)/);
      expect(call, `${p.rel}/page.tsx must call guardDoctorPage`).not.toBeNull();
      const expected = "/" + p.segments.map((s) => (s.startsWith("[") ? "${" + s.slice(1, -1) + "}" : s)).join("/");
      expect(call?.[1], `${p.rel}: guard path must be the page's own path`).toBe(expected);
      expect(p.src, `${p.rel}: must return the denied view`).toMatch(/if \(!g\.ok\) return g\.view;/);
    }
    // DoctorStaticPage itself runs the guard.
    const statikSrc = readFileSync(join(process.cwd(), "src", "components", "doctor", "static-page.tsx"), "utf8");
    expect(statikSrc).toMatch(/await guardDoctorPage\(locale, `\/\$\{section\}`\)/);
    expect(statikSrc).toMatch(/if \(!g\.ok\) return g\.view;/);
  });

  it("doctor layout defers the signed-out redirect to the pages (no dashboard return)", () => {
    const layout = readFileSync(join(APP, "doctor", "layout.tsx"), "utf8");
    expect(layout).not.toMatch(/\bredirect\(/);
  });
});
