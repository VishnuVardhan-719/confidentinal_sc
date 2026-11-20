import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R9-E7: the public stories source keeps every content outcome distinct, so the pages can show
 * the right state: published list, empty (with or without the fixture notice), gated ("not
 * available yet"), unavailable (an error with retry, never an empty list) and not found (404).
 */

const content = vi.hoisted(() => ({ list: vi.fn(), story: vi.fn() }));
vi.mock("@/modules/content/public", () => ({ getPublishedStories: content.list, getPublishedStory: content.story }));

import { getPublishedStory, listPublishedStories } from "@/components/public/stories-source";

const STORY = { slug: "s", title: "T", summary: "S", publishedAt: "2026-11-01T00:00:00Z", body: { blocks: [] } };

beforeEach(() => {
  content.list.mockReset();
  content.story.mockReset();
});

describe("listPublishedStories", () => {
  it.each([
    ["ok", { status: "ok", data: [STORY], fixture: true }, { count: 1, fixture: true, gated: false, unavailable: false }],
    ["empty (fixture)", { status: "empty", fixture: true }, { count: 0, fixture: true, gated: false, unavailable: false }],
    ["empty (live)", { status: "empty", fixture: false }, { count: 0, fixture: false, gated: false, unavailable: false }],
    ["gated", { status: "gated" }, { count: 0, fixture: false, gated: true, unavailable: false }],
    ["unavailable", { status: "unavailable" }, { count: 0, fixture: false, gated: false, unavailable: true }],
  ])("%s", async (_case, result, expected) => {
    content.list.mockResolvedValue(result);
    const out = await listPublishedStories("en");
    expect({ count: out.stories.length, fixture: out.fixture, gated: out.gated, unavailable: out.unavailable }).toEqual(expected);
  });
});

describe("getPublishedStory", () => {
  it.each([
    ["ok", { status: "ok", data: STORY, fixture: false }, "ok"],
    ["gated", { status: "gated" }, "gated"],
    ["unavailable is an error, not a 404", { status: "unavailable" }, "unavailable"],
    ["not_found", { status: "not_found" }, "not_found"],
    ["empty", { status: "empty", fixture: false }, "not_found"],
  ])("%s", async (_case, result, kind) => {
    content.story.mockResolvedValue(result);
    expect((await getPublishedStory("en", "s")).kind).toBe(kind);
  });
});
