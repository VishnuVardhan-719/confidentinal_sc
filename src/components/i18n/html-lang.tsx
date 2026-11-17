"use client";

import { useEffect } from "react";

/** Keeps <html lang> in step with the locale after a client-side language change. */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
