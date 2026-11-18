import { Figtree, Newsreader, Noto_Sans_Devanagari, Noto_Sans_Telugu } from "next/font/google";

/**
 * Font system (self-hosted at build time by next/font; no runtime Google requests).
 * - Newsreader: Latin editorial display serif for headings.
 * - Figtree: Latin UI sans.
 * - Noto Sans Telugu / Noto Sans Devanagari: native scripts. Not preloaded; the @font-face
 *   unicode-range means browsers download them only when Telugu/Devanagari glyphs render.
 * Families are proposals pending client brand approval (FRONTEND_MASTER section 4).
 */
export const fontSerif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const fontUi = Figtree({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ui",
  display: "swap",
});

export const fontTelugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  variable: "--font-telugu",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  preload: false,
});

export const fontDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  preload: false,
});

export const fontVariables = [fontSerif.variable, fontUi.variable, fontTelugu.variable, fontDevanagari.variable].join(" ");
