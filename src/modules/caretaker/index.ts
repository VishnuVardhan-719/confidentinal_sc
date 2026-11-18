import { getAdapterMode } from "@/lib/api/mode";
import type { CaretakerApi } from "./api";
import { createCaretakerFixtureApi, type CaretakerFixtureOptions } from "./fixture";
import { createCaretakerHttpApi } from "./http";

export type { CaretakerApi } from "./api";
export * from "./types";
export * from "./rules";
export * from "./status";

/** Returns the caretaker API for the current adapter mode. Fixture is refused in production. */
export function getCaretakerApi(options: CaretakerFixtureOptions = {}): CaretakerApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture" ? createCaretakerFixtureApi({ ...options, env }) : createCaretakerHttpApi();
}
