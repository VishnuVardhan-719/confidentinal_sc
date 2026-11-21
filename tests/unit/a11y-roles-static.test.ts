/** R-FE-P-R9-7: static a11y checks for the lab, ambulance and caretaker workspaces. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../../src");
const ROLES = ["lab", "ambulance", "caretaker"];

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? tsx(f) : n.endsWith(".tsx") && !n.endsWith(".test.tsx") ? [f] : [];
  });
}

const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const roleComponents = ROLES.flatMap((r) => tsx(path.join(SRC, "components", r)));
const rolePages = ROLES.flatMap((r) => tsx(path.join(SRC, "app", "[locale]", r)).filter((f) => f.endsWith("page.tsx")));
const tags = (src: string, name: string) => src.match(new RegExp(`<${name}\\b[^>]*?(?:=>[^>]*?)*>`, "gs")) ?? [];

describe("lab, ambulance and caretaker workspaces: static a11y", () => {
  it("finds the sources", () => {
    expect(roleComponents.length).toBeGreaterThan(5);
    expect(rolePages.length).toBeGreaterThan(10);
  });

  it("every <img> has alt", () => {
    const bad = roleComponents.flatMap((f) => tags(readFileSync(f, "utf8"), "img").filter((t) => !/\balt=/.test(t)).map(() => rel(f)));
    expect(bad).toEqual([]);
  });

  it("no positive tabIndex", () => {
    const bad = roleComponents.filter((f) => /tabIndex=\{?["']?[1-9]/.test(readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });

  it("no click handlers on non-interactive div/span without a role", () => {
    const bad = roleComponents.flatMap((f) =>
      [...tags(readFileSync(f, "utf8"), "div"), ...tags(readFileSync(f, "utf8"), "span")].filter((t) => /\bonClick=/.test(t) && !/\brole=/.test(t)).map(() => rel(f)),
    );
    expect(bad).toEqual([]);
  });

  it("every input, select and textarea is labelled", () => {
    const bad: string[] = [];
    for (const f of roleComponents) {
      const src = readFileSync(f, "utf8");
      for (const name of ["input", "select", "textarea"]) {
        for (const t of tags(src, name)) {
          if (/type=["'](hidden|submit|button)["']/.test(t)) continue;
          if (/\b(aria-label|aria-labelledby|id)=/.test(t) || /\{\.\.\.[A-Za-z.]+\}/.test(t)) continue;
          // Wrapped by a <label> in the same file counts.
          if (/<label\b/.test(src)) continue;
          bad.push(`${rel(f)}: ${t.slice(0, 60)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("icon-only buttons carry an accessible name", () => {
    const bad: string[] = [];
    for (const f of roleComponents) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<button\b([^>]*)>\s*<(?:svg|Icon)\b[\s\S]*?<\/button>/g)) {
        if (!/aria-label|aria-labelledby|title=/.test(m[1]!) && !/sr-only/.test(m[0])) bad.push(rel(f));
      }
    }
    expect(bad).toEqual([]);
  });

  it("each page renders through a layout that provides the single h1 or renders one itself", () => {
    const bad = rolePages.filter((f) => {
      const src = readFileSync(f, "utf8");
      return !/<h1\b|<ProviderOnboarding|PageHeader|WorkspacePage|<[A-Z][A-Za-z]*(?:Page|View|Dashboard|Screen|Form|Workspace|Home|Directory|List|Inbox|Calendar|Table)\b/.test(src) && !/redirect\(|notFound\(/.test(src);
    });
    expect(bad.map(rel)).toEqual([]);
  });
});
