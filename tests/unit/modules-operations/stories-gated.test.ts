import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublishedStory, listPublishedStories } from "@/components/public/stories-source";

// Locale routing is next-intl's concern; here only the story check is under test.
vi.mock("next-intl/middleware", () => ({ default: () => () => new Response(null, { status: 200 }) }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stories while the content backend is gated (http adapter, no CMS contract)", () => {
  it("the list reports gated with no stories and no fixture notice", async () => {
    vi.stubEnv("FRONTEND_ADAPTER", "http");
    expect(await listPublishedStories("en")).toEqual({ stories: [], fixture: false, gated: true, unavailable: false });
  });

  it("a story URL is gated (a 'not available yet' page), not a 404", async () => {
    vi.stubEnv("FRONTEND_ADAPTER", "http");
    expect(await getPublishedStory("en", "any-slug")).toEqual({ kind: "gated" });
  });

  it("with the fixture adapter, published stories load and unknown slugs are not_found", async () => {
    vi.stubEnv("FRONTEND_ADAPTER", "fixture");
    vi.stubEnv("APP_ENV", "development");
    const list = await listPublishedStories("en");
    expect(list.gated).toBe(false);
    expect(list.stories.length).toBeGreaterThan(0);
    const found = await getPublishedStory("en", list.stories[0].slug);
    expect(found.kind).toBe("ok");
    expect(await getPublishedStory("en", "no-such-story")).toEqual({ kind: "not_found" });
  });
});

describe("proxy story check", () => {
  it("rewrites only unknown slugs to the 404 page; gated stories pass through to the page", async () => {
    const { NextRequest } = await import("next/server");
    const { default: proxy } = await import("@/proxy");

    vi.stubEnv("FRONTEND_ADAPTER", "http");
    const gated = await proxy(new NextRequest("http://localhost/en/stories/any-slug"));
    expect(gated.headers.get("x-middleware-rewrite") ?? "").not.toContain("__not-found__");

    vi.stubEnv("FRONTEND_ADAPTER", "fixture");
    vi.stubEnv("APP_ENV", "development");
    const unknown = await proxy(new NextRequest("http://localhost/en/stories/no-such-story"));
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("x-middleware-rewrite")).toContain("/en/__not-found__");
  });
});
