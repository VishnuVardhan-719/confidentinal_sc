import { en, type TemplateKey, type Template } from "./en";
// English placeholders only; no Hindi translation has been human reviewed.
export const hi = Object.fromEntries(Object.entries(en).map(([key, value]) => [key, { text: value.text, reviewed: false }])) as Record<TemplateKey, Template>;
