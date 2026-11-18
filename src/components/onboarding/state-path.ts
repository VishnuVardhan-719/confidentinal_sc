import type { FormObject, FormValue } from "./form-spec";

/** Immutable update of a nested form value by path segments (strings for keys, numbers for rows). */
export function setAt(root: FormObject, path: readonly (string | number)[], value: FormValue): FormObject {
  if (path.length === 0) return root;
  const [head, ...rest] = path;
  const key = String(head);
  const current = root[key];
  if (rest.length === 0) return { ...root, [key]: value };
  const next = rest[0];
  if (typeof next === "number") {
    const rows = Array.isArray(current) ? [...(current as FormObject[])] : [];
    const [, ...afterIndex] = rest;
    rows[next] = afterIndex.length === 0 ? (value as FormObject) : setAt(rows[next] ?? {}, afterIndex, value);
    return { ...root, [key]: rows };
  }
  const child = current && typeof current === "object" && !Array.isArray(current) ? (current as FormObject) : {};
  return { ...root, [key]: setAt(child, rest, value) };
}

export const joinPath = (path: readonly (string | number)[]): string => path.map(String).join(".");
