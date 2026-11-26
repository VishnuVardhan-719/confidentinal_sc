import { describe, expect, it } from "vitest";
import { sitemapEntries } from "@/components/public/sitemap-entries";
import { llmsText } from "@/app/llms.txt/route";
import { PRELAUNCH_OPEN_PAGES, isPrelaunch, prelaunchDecision } from "@/lib/launch-mode";
import { fixtureRefusal } from "@/lib/api/mode";

describe("pre-launch mode", () => {
  it("is on only for LAUNCH_MODE=prelaunch", () => {
    expect(isPrelaunch({ LAUNCH_MODE: "prelaunch" })).toBe(true);
    expect(isPrelaunch({ LAUNCH_MODE: "off" })).toBe(false);
    expect(isPrelaunch({})).toBe(false);
  });

  it("keeps the information pages open in every language, with or without a trailing slash", () => {
    for (const locale of ["en", "te", "hi"]) {
      for (const page of PRELAUNCH_OPEN_PAGES) {
        const path = page === "/" ? `/${locale}` : `/${locale}${page}`;
        expect(prelaunchDecision(path, "GET")).toEqual({ action: "pass" });
        expect(prelaunchDecision(`${path}/`, "HEAD")).toEqual({ action: "pass" });
      }
    }
  });

  it("holds every other route, deny by default", () => {
    for (const path of [
      "/en/login", "/en/signup", "/en/signup/", "/en/doctors", "/en/doctors/abc", "/en/lab-tests", "/en/ambulances", "/en/caretakers",
      "/en/find", "/en/become-a-provider", "/en/stories", "/en/patient", "/en/patient/bookings", "/en/doctor", "/en/admin", "/en/admin/verification",
      "/en/account", "/en/workspace", "/en/verify", "/te/login", "/hi/admin", "/en/about/extra", "/en/ABOUT", "/en/%2e%2e/admin", "/en/launching-soon",
    ]) {
      expect(prelaunchDecision(path, "GET"), path).toEqual({ action: "hold", locale: path.slice(1, 3) });
    }
  });

  it("refuses anything but GET and HEAD on locale paths, so no form or server action can run", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(prelaunchDecision("/en/login", method)).toEqual({ action: "refuse-method" });
      expect(prelaunchDecision("/en/about", method)).toEqual({ action: "refuse-method" });
    }
  });

  it("leaves unprefixed paths to the locale redirect, which is decided on the next request", () => {
    expect(prelaunchDecision("/login", "GET")).toEqual({ action: "pass" });
  });

  it("lists only the open pages in the sitemap and llms.txt", () => {
    const env = { APP_ENV: "production", LAUNCH_MODE: "prelaunch" };
    const urls = sitemapEntries(env).map((e) => e.url).join("\n");
    expect(urls).toContain("/en/about");
    for (const closed of ["/doctors", "/lab-tests", "/ambulances", "/caretakers", "/become-a-provider", "/stories", "/login"]) {
      expect(urls).not.toContain(closed);
    }
    const llms = llmsText(env) ?? "";
    expect(llms).toContain("launching soon");
    expect(llms).not.toContain("/en/doctors");
  });

  it("never turns fixtures on: production still refuses them in pre-launch mode", () => {
    expect(fixtureRefusal({ APP_ENV: "production", LAUNCH_MODE: "prelaunch" })).not.toBeNull();
  });
});
