import { getAdapterMode } from "@/lib/api/mode";
import type { ContentApi, PublicContentApi } from "./api";
import { createContentFixtureApi, createPublicContentFixtureApi, type ContentFixtureOptions } from "./fixture";
import { createContentHttpApi, createPublicContentHttpApi } from "./http";

export type { ContentApi, PublicContentApi } from "./api";
export * from "./schema";
export * from "./types";
export * from "./rules";
export * from "./status";

/** Admin CMS API for the current adapter mode. Fixture is refused in production. */
export function getContentApi(options: ContentFixtureOptions = {}): ContentApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createContentFixtureApi({ ...options, env }) : createContentHttpApi();
}

/** Public stories/FAQ read model for the public site. */
export function getPublicContentApi(options: Pick<ContentFixtureOptions, "env" | "store"> = {}): PublicContentApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createPublicContentFixtureApi({ ...options, env }) : createPublicContentHttpApi();
}
