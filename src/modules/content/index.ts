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

/** Admin CMS API for the current adapter mode. Fixture is refused in production. */
let sharedStore: ContentFixtureStore | undefined;
const store = (options: ContentFixtureOptions) => options.store ?? (sharedStore ??= createContentFixtureStore());

export function getContentApi(options: ContentFixtureOptions = {}): ContentApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createContentFixtureApi({ ...options, env, store: store(options) }) : createContentHttpApi();
}

/** Public stories/FAQ read model for the public site. */
export function getPublicContentApi(options: Pick<ContentFixtureOptions, "env" | "store"> = {}): PublicContentApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createPublicContentFixtureApi({ ...options, env, store: store(options) }) : createPublicContentHttpApi();
}
