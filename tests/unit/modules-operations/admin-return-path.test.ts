import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loginRedirectPath } from "@/modules/admin/access";
import { adminPagePath, decideAdminRoute } from "@/modules/admin/routes";

const nextOf = (loginPath: string) => new URL(loginPath, "https://surecurevisit.invalid").searchParams.get("next");

describe("admin sign-in return path (R9-P2)", () => {
  it("a signed-out visit to the decision log returns to the log after sign-in", () => {
    const access = decideAdminRoute(null, "reviews", "en", adminPagePath("en", "reviews", "log"));
    expect(access).toEqual({ kind: "unauthenticated", loginPath: "/en/login?next=%2Fen%2Fadmin%2Freviews%2Flog" });
    if (access.kind === "unauthenticated") expect(nextOf(access.loginPath)).toBe("/en/admin/reviews/log");
    const te = decideAdminRoute(null, "reviews", "te", adminPagePath("te", "reviews", "log"));
    expect(te.kind === "unauthenticated" && nextOf(te.loginPath)).toBe("/te/admin/reviews/log");
  });

  it("without a sub path the route root is used, as before", () => {
    expect(adminPagePath("hi", "reviews")).toBe("/hi/admin/reviews");
    expect(adminPagePath("en", "audit", undefined)).toBe("/en/admin/audit");
  });

  it.each([
    "",
    "../../../evil",
    "log/../../x",
    "//evil.example",
    "/log",
    "log/",
    "log//x",
    "log?next=https://evil.example",
    "log#frag",
    "https://evil.example",
    "%2F%2Fevil.example",
    "log\\evil",
    "LOG",
    "log x",
    "log\n",
  ])("an unsafe sub path %j falls back to the route root", (sub) => {
    expect(adminPagePath("en", "reviews", sub)).toBe("/en/admin/reviews");
  });

  it.each([
    "//evil.example/en/admin",
    "https://evil.example/en/admin/reviews/log",
    "/\\evil.example",
    "/en//evil.example",
    "/en/admin/reviews/../../x",
    "/fr/admin/reviews/log",
    "/en/admin/reviews/log%2F%2Fevil.example",
    "javascript:alert(1)",
  ])("the next param never leaves the site: %j becomes the locale home", (path) => {
    expect(nextOf(loginRedirectPath("en", path))).toBe("/en");
  });

  it("query strings and fragments are dropped from next", () => {
    expect(nextOf(loginRedirectPath("en", "/en/admin/reviews/log?status=published#top"))).toBe("/en/admin/reviews/log");
  });

  it("every admin page is gated, because the layout no longer redirects signed-out visitors", () => {
    const root = join(process.cwd(), "src", "app", "[locale]", "admin");
    const pages = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /(^|[\\/])page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(13);
    for (const p of pages) {
      const src = readFileSync(join(root, p), "utf8");
      const gated = /<AdminRouteGate\s+route="/.test(src) || /^\s*redirect\(`\/\$\{await currentLocale\(\)\}\/admin\/dashboard`\);\s*$/m.test(src);
      expect(gated, `${p} must render inside AdminRouteGate`).toBe(true);
    }
    const sub = readFileSync(join(root, "reviews", "log", "page.tsx"), "utf8");
    expect(sub).toMatch(/<AdminRouteGate route="reviews" subPath="log">/);
  });
});
