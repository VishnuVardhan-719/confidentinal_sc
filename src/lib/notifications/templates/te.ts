import { en, type TemplateKey, type Template } from "./en";
// English placeholders only; no Telugu translation has been human reviewed.
export const te = Object.fromEntries(Object.entries(en).map(([key, value]) => [key, { text: value.text, reviewed: false }])) as Record<TemplateKey, Template>;
