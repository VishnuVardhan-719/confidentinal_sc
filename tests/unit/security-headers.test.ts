import { describe, expect, it } from "vitest";
import nextConfig, { buildCsp, securityHeaders } from "../../next.config";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );
}

describe("CSP", () => {
  const prod = directives(buildCsp({ isDev: false }));

  it("never allows eval in production", () => {
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(buildCsp({ isDev: false })).not.toContain("unsafe-eval");
  });

  it("allows eval and HMR websockets only in development", () => {
    const dev = directives(buildCsp({ isDev: true }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toContain("ws:");
    expect(prod.get("connect-src")).not.toContain("ws:");
  });

  it("locks down framing, plugins, base URI and form targets", () => {
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'none'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
    expect(prod.get("default-src")).toEqual(["'self'"]);
  });

  it("does not allow inline styles or any third-party origin in production", () => {
    expect(prod.get("style-src")).toEqual(["'self'"]);
    for (const [name, values] of prod) {
      for (const v of values) {
        expect(v, `${name} ${v}`).not.toMatch(/^https?:|^\*|googleapis|gstatic/);
      }
    }
  });

  it("adds only the configured Supabase origin, over https/wss", () => {
    const csp = directives(buildCsp({ isDev: false, supabaseUrl: "https://abcd.supabase.co/rest/v1" }));
    expect(csp.get("connect-src")).toEqual(["'self'", "https://abcd.supabase.co", "wss://abcd.supabase.co"]);
  });

  it("ignores a malformed or non-https Supabase URL", () => {
    for (const bad of ["not a url", "http://abcd.supabase.co", "javascript:alert(1)", ""]) {
      expect(directives(buildCsp({ isDev: false, supabaseUrl: bad })).get("connect-src")).toEqual(["'self'"]);
    }
  });
});

describe("security headers", () => {
  const headers = Object.fromEntries(securityHeaders({ isDev: false }).map((h) => [h.key, h.value]));

  it("sets the baseline headers", () => {
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}; includeSubDomains/);
    expect(headers["Strict-Transport-Security"]).not.toContain("preload");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
  });

  it("turns off camera, microphone and geolocation", () => {
    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(headers["Permissions-Policy"]).toContain(`${feature}=()`);
    }
  });

  it("applies to every route and hides X-Powered-By", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(rules[0].headers.map((h) => h.key)).toContain("Content-Security-Policy");
  });
});
