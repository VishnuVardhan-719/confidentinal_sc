import { getAdapterMode } from "@/lib/api/mode";
import type { ContentApi, PublicContentApi } from "./api";
import {
  createContentFixtureApi,
  createContentFixtureStore,
  createPublicContentFixtureApi,
  type ContentFixtureOptions,
  type ContentFixtureStore,
} from "./fixture";
import { createContentHttpApi, createPublicContentHttpApi } from "./http";

export type { ContentApi, PublicContentApi } from "./api";
export * from "./schema";
export * from "./types";
export * from "./rules";
export * from "./status";

/**
 * Admin CMS API for the current adapter mode. Fixture is refused in production.
 * The fixture store lives on globalThis so the proxy (src/proxy.ts, same server process,
 * separate bundle) sees the same published content as the pages.
 */
const STORE_KEY = Symbol.for("scv.content.fixtureStore");
const globalStore = globalThis as typeof globalThis & { [STORE_KEY]?: ContentFixtureStore };
const store = (options: ContentFixtureOptions) => options.store ?? (globalStore[STORE_KEY] ??= createContentFixtureStore());

export function getContentApi(options: ContentFixtureOptions = {}): ContentApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createContentFixtureApi({ ...options, env, store: store(options) }) : createContentHttpApi();
}

/** Public stories/FAQ read model for the public site. */
export function getPublicContentApi(options: Pick<ContentFixtureOptions, "env" | "store"> = {}): PublicContentApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createPublicContentFixtureApi({ ...options, env, store: store(options) }) : createPublicContentHttpApi();
}
