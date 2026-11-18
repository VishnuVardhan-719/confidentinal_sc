import { getAdapterMode } from "@/lib/api/mode";
import type { CaretakerApi } from "./api";
import { createCaretakerFixtureApi, createCaretakerFixtureStore, type CaretakerFixtureOptions, type CaretakerFixtureStore } from "./fixture";
import { createCaretakerHttpApi } from "./http";

export type { CaretakerApi } from "./api";
export * from "./types";
export * from "./rules";
export * from "./status";

/** Returns the caretaker API for the current adapter mode. Fixture is refused in production. */
let sharedStore: CaretakerFixtureStore | undefined;

export function getCaretakerApi(options: CaretakerFixtureOptions = {}): CaretakerApi {
  const env = options.env ?? process.env;
  if (getAdapterMode(env) !== "fixture") return createCaretakerHttpApi();
  return createCaretakerFixtureApi({ ...options, env, store: options.store ?? (sharedStore ??= createCaretakerFixtureStore()) });
}
