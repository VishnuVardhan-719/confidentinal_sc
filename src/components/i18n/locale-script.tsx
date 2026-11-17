import { LOCALE_COOKIE, LOCALES } from "./config";

/*
 * Server component. Place it as the first child of <body> in the root layout.
 * Runs while the HTML is parsed, before first paint, so :lang() typography applies with no flash.
 * <html lang> is "en" in the static shell because cacheComponents prerenders it; this corrects it
 * from the cookie. Only the three known values are accepted. Inline, no data from the request.
 */
const script = `(function(){try{var m=document.cookie.match(/(?:^|; )${LOCALE_COOKIE}=([^;]+)/);var v=m&&decodeURIComponent(m[1]);if(${JSON.stringify(
  LOCALES,
)}.indexOf(v)>-1)document.documentElement.lang=v;}catch(e){}})();`;

export function LocaleScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
