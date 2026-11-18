import type { Metadata } from "next";

/** Private workspace pages: localized title, never indexed. */
export const privateMetadata = (title: string): Metadata => ({ title, robots: { index: false, follow: false } });