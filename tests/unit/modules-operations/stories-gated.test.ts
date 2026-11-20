import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublishedStories, getPublishedStory } from "@/components/public/content-source";

// Locale routing is next-intl's concern; here only the story check is under test.
vi.mock("next-intl/middleware", () => ({ default: () => () => new Response(null, { status: 200 }) }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stories while the content backend is gated (http adapter, no CMS contract)", () => {
  it("the list reports gated with no stories and no fixture notice", async () => {
    vi.stubEnv("FRONTEND_ADAPTER", "http");
    expect(await getPublishedStories("en")).toEqual({ status: "gated" });
  });

  it("a story URL is gated (a 'not available yet' page), not a 404", async () => {
    vi.stubEnv("FRONTEND_ADAPTER", "http");
    expect(await getPublishedStory("any-slug", "en")).toEqual({ status: "gated" });
  });

  it("with the fixture adapter, published stories load and unknown slugs are not_found", async () => {
    vi.stubEnv("FRONTEND_ADAPTER", "fixture");
    vi.stubEnv("APP_ENV", "development");
    const list = await getPublishedStories("en");
    if (list.status !== "ok") throw new Error(`expected published fixture stories, got ${list.status}`);
    expect(list.data.length).toBeGreaterThan(0);
    const found = await getPublishedStory(list.data[0].slug, "en");
    expect(found.status).toBe("ok");
    expect(await getPublishedStory("no-such-story", "en")).toEqual({ status: "not_found" });
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
