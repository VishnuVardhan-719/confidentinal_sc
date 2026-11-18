"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Field } from "@/components/shared/field";
import { Notice } from "@/components/shared/notice";
import { PhoneInput } from "@/components/shared/phone-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/components/ui/cn";
import { fieldControlClass, Input, Textarea } from "@/components/ui/input";
import { emptyObject, fieldDomId, WEEKDAYS, type FieldSpec, type FormObject, type FormValue } from "./form-spec";
import { joinPath } from "./state-path";
import { LocationField } from "./location-field";

export type EvidenceOption = { documentId: string; kind: string; label: string };

export type RenderContext = {
  /** Translate an `onboarding` key; returns null when the key does not exist. */
  tr: (key: string, values?: Record<string, string | number>) => string;
  has: (key: string) => boolean;
  /** Localized error for an exact path, if any. */
  errorAt: (path: string) => string | undefined;
  evidence: readonly EvidenceOption[];
  disabled: boolean;
  onChange: (path: (string | number)[], value: FormValue) => void;
};

const str = (v: FormValue | undefined) => (typeof v === "string" ? v : "");

function hint(ctx: RenderContext, f: FieldSpec): string | undefined {
  return f.hintKey && ctx.has(f.hintKey) ? ctx.tr(f.hintKey) : undefined;
}

/** Renders one spec field bound to `value` at `path`. */
export function FieldRenderer({ spec, value, path, ctx }: { spec: FieldSpec; value: FormValue | undefined; path: (string | number)[]; ctx: RenderContext }) {
  const t = useTranslations("onboarding");
  const id = fieldDomId(joinPath(path));
  const label = ctx.tr(spec.labelKey);
  const error = ctx.errorAt(joinPath(path));
  const required = !spec.optional;
  const set = (v: FormValue) => ctx.onChange(path, v);

  switch (spec.kind) {
    case "text":
    case "date":
    case "int":
    case "decimal":
    case "pinList":
    case "langList":
    case "rupees": {
      const numeric = spec.kind === "int" || spec.kind === "decimal" || spec.kind === "rupees" || (spec.kind === "text" && spec.inputMode === "numeric");
      const unit = (spec.kind === "int" || spec.kind === "decimal") && spec.unitKey ? ctx.tr(spec.unitKey) : null;
      return (
        <Field id={id} label={label} hint={hint(ctx, spec)} error={error} required={required}>
          {(control) => (
            <div className={cn("flex items-stretch", (spec.kind === "int" || spec.kind === "decimal" || spec.kind === "rupees") && "max-w-xs")}>
              {spec.kind === "rupees" ? (
                <span aria-hidden className="inline-flex min-h-target items-center rounded-l-md border border-r-0 border-border-strong bg-paper-deep px-3 font-medium text-ink">
                  ₹
                </span>
              ) : null}
              <Input
                {...control}
                type={spec.kind === "date" ? "date" : "text"}
                inputMode={numeric ? (spec.kind === "rupees" || spec.kind === "decimal" ? "decimal" : "numeric") : spec.kind === "text" ? spec.inputMode : undefined}
                autoComplete={spec.kind === "text" ? (spec.autoComplete ?? "off") : "off"}
                value={str(value)}
                onChange={(e) => set(e.target.value)}
                disabled={ctx.disabled}
                className={cn(spec.kind === "rupees" && "rounded-l-none", unit && "rounded-r-none", numeric && "tabular")}
              />
              {unit ? (
                <span className="inline-flex min-h-target items-center rounded-r-md border border-l-0 border-border-strong bg-paper-deep px-3 text-sm text-muted">{unit}</span>
              ) : null}
            </div>
          )}
        </Field>
      );
    }
    case "textarea":
      return (
        <Field id={id} label={label} hint={hint(ctx, spec)} error={error} required={required}>
          {(control) => <Textarea {...control} value={str(value)} onChange={(e) => set(e.target.value)} disabled={ctx.disabled} />}
        </Field>
      );
    case "phone":
      return (
        <Field id={id} label={label} hint={hint(ctx, spec)} error={error} required={required}>
          {(control) => <PhoneInput {...control} value={str(value)} onValueChange={(d) => set(d)} disabled={ctx.disabled} />}
        </Field>
      );
    case "select":
      return (
        <Field id={id} label={label} hint={hint(ctx, spec)} error={error} required={required}>
          {(control) => (
            <select {...control} value={str(value)} onChange={(e) => set(e.target.value)} disabled={ctx.disabled} className={fieldControlClass}>
              <option value="">{t("form.choose")}</option>
              {spec.options.map((o) => (
                <option key={o} value={o}>
                  {ctx.tr(`options.${spec.optionSet}.${o}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      );
    case "documentRef": {
      const options = ctx.evidence.filter((e) => e.kind === spec.documentKind);
      if (options.length === 0) {
        return (
          <div className="grid gap-2">
            <p className="text-base font-semibold text-ink">{label}</p>
            <Notice id={id} tone="neutral" icon="lock">
              {t("form.noDocumentOfKind", { kind: ctx.tr(`documentKinds.${spec.documentKind}`) })}
            </Notice>
            {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
          </div>
        );
      }
      return (
        <Field id={id} label={label} hint={hint(ctx, spec)} error={error} required={required}>
          {(control) => (
            <select {...control} value={str(value)} onChange={(e) => set(e.target.value)} disabled={ctx.disabled} className={fieldControlClass}>
              <option value="">{t("form.choose")}</option>
              {options.map((o) => (
                <option key={o.documentId} value={o.documentId}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      );
    }
    case "unavailableAsset":
      return (
        <div className="grid gap-2">
          <p className="text-base font-semibold text-ink">{label}</p>
          <Notice id={id} tone="neutral" icon="lock">
            {hint(ctx, spec) ?? t("form.unavailable")}
          </Notice>
          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        </div>
      );
    case "boolean":
    case "consent":
      return (
        <div className="grid gap-1.5">
          <label htmlFor={id} className="flex min-h-target cursor-pointer items-start gap-3">
            <Checkbox
              id={id}
              checked={value === true}
              onCheckedChange={(c) => set(c === true)}
              disabled={ctx.disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-base text-ink">{label}</span>
              {hint(ctx, spec) ? <span className="text-sm text-muted">{hint(ctx, spec)}</span> : null}
            </span>
          </label>
          {error ? (
            <p id={`${id}-error`} className="pl-8 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      );
    case "multi": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset id={id} className="grid gap-2" aria-describedby={error ? `${id}-error` : undefined}>
          <legend className="text-base font-semibold text-ink">{label}</legend>
          {hint(ctx, spec) ? <p className="-mt-1 text-sm text-muted">{hint(ctx, spec)}</p> : null}
          {error ? (
            <p id={`${id}-error`} className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid gap-1 sm:grid-cols-2">
            {spec.options.map((o) => {
              const optionId = `${id}-${o}`;
              return (
                <label key={o} htmlFor={optionId} className="flex min-h-target cursor-pointer items-center gap-3">
                  <Checkbox
                    id={optionId}
                    checked={selected.includes(o)}
                    onCheckedChange={(c) => set(c === true ? [...selected, o] : selected.filter((x) => x !== o))}
                    disabled={ctx.disabled}
                  />
                  <span className="text-base text-ink">{ctx.tr(`options.${spec.optionSet}.${o}`)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }
    case "const":
      return spec.hintKey ? (
        <div className="grid gap-1">
          <p className="text-base font-semibold text-ink">{label}</p>
          <p className="text-base text-muted">{ctx.tr(spec.hintKey)}</p>
        </div>
      ) : null;
    case "birth": {
      const b = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as FormObject;
      if (spec.dobOnly) {
        const dobPath = joinPath([...path, "dateOfBirth"]);
        return (
          <Field id={fieldDomId(joinPath(path))} label={label} hint={hint(ctx, spec)} error={ctx.errorAt(dobPath) ?? error} required>
            {(control) => (
              <Input
                {...control}
                type="date"
                autoComplete="bday"
                value={str(b.dateOfBirth)}
                onChange={(e) => set({ ...b, mode: "dob", dateOfBirth: e.target.value })}
                disabled={ctx.disabled}
                className="max-w-xs"
              />
            )}
          </Field>
        );
      }
      const mode = !spec.dobOnly && str(b.mode) === "age" ? "age" : "dob";
      const dobError = ctx.errorAt(joinPath([...path, "dateOfBirth"]));
      const ageError = ctx.errorAt(joinPath([...path, "years"]));
      return (
        <fieldset className="grid gap-3">
          <legend className="text-base font-semibold text-ink">{label}</legend>
          {hint(ctx, spec) ? <p className="-mt-1 text-sm text-muted">{hint(ctx, spec)}</p> : null}
          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
          <div className={cn("flex flex-wrap gap-4", spec.dobOnly && "hidden")}>
            {(["dob", "age"] as const).map((m) => (
              <label key={m} className="flex min-h-target cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={mode === m}
                  onChange={() => set({ ...b, mode: m })}
                  disabled={ctx.disabled}
                  className="size-5 accent-forest"
                />
                <span className="text-base text-ink">{t(`form.birth.${m}`)}</span>
              </label>
            ))}
          </div>
          {mode === "dob" ? (
            <Field id={fieldDomId(joinPath([...path, "dateOfBirth"]))} label={t("form.birth.dobLabel")} error={dobError} required>
              {(control) => <Input {...control} type="date" value={str(b.dateOfBirth)} onChange={(e) => set({ ...b, dateOfBirth: e.target.value })} disabled={ctx.disabled} />}
            </Field>
          ) : (
            <Field id={fieldDomId(joinPath([...path, "years"]))} label={t("form.birth.ageLabel")} error={ageError} required>
              {(control) => (
                <Input {...control} inputMode="numeric" value={str(b.years)} onChange={(e) => set({ ...b, years: e.target.value })} disabled={ctx.disabled} className="max-w-32 tabular" />
              )}
            </Field>
          )}
        </fieldset>
      );
    }
    case "location": {
      const obj = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as FormObject;
      return <LocationField id={id} label={label} hintText={hint(ctx, spec)} error={error} value={obj} disabled={ctx.disabled} onChange={(next) => set(next)} />;
    }
    case "hours":
      return <HoursEditor id={id} label={label} hintText={hint(ctx, spec)} value={value} path={path} ctx={ctx} />;
    case "group": {
      const obj = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as FormObject;
      return (
        <fieldset className="grid gap-4 rounded-md border border-border p-4">
          <legend className="px-1 text-base font-semibold text-ink">
            {label}
            {spec.optional ? <span className="ml-2 text-sm font-normal text-muted">{t("form.optional")}</span> : null}
          </legend>
          {hint(ctx, spec) ? <p className="text-sm text-muted">{hint(ctx, spec)}</p> : null}
          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
          {spec.fields.map((f) => (
            <FieldRenderer key={f.name} spec={f} value={obj[f.name]} path={[...path, f.name]} ctx={ctx} />
          ))}
        </fieldset>
      );
    }
    case "list": {
      const rows = Array.isArray(value) ? (value as FormObject[]) : [];
      return (
        <ListEditor
          id={id}
          label={label}
          hintText={hint(ctx, spec)}
          error={error}
          rows={rows}
          max={spec.max}
          addLabel={ctx.tr(spec.addKey)}
          fields={spec.fields}
          path={path}
          ctx={ctx}
        />
      );
    }
  }
}

export function ListEditor({
  id,
  label,
  hintText,
  error,
  rows,
  max,
  addLabel,
  fields,
  path,
  ctx,
}: {
  id: string;
  label: ReactNode;
  hintText?: string;
  error?: string;
  rows: FormObject[];
  max: number;
  addLabel: string;
  fields: readonly FieldSpec[];
  path: (string | number)[];
  ctx: RenderContext;
}) {
  const t = useTranslations("onboarding");
  const setRows = (next: FormObject[]) => ctx.onChange(path, next);
  return (
    <fieldset id={id} className="grid gap-4">
      <legend className="text-base font-semibold text-ink">{label}</legend>
      {hintText ? <p className="-mt-2 text-sm text-muted">{hintText}</p> : null}
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      <ol className="grid gap-4">
        {rows.map((row, i) => (
          <li key={i} className="grid gap-4 rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-muted">{t("form.itemNumber", { number: i + 1 })}</p>
              <Button
                variant="quiet"
                size="md"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                disabled={ctx.disabled}
                aria-label={t("form.removeItem", { number: i + 1 })}
              >
                <Trash2 aria-hidden />
                {t("form.remove")}
              </Button>
            </div>
            {fields.map((f) => (
              <FieldRenderer key={f.name} spec={f} value={row[f.name]} path={[...path, i, f.name]} ctx={ctx} />
            ))}
          </li>
        ))}
      </ol>
      {rows.length < max ? (
        <Button variant="secondary" className="w-fit" onClick={() => setRows([...rows, emptyObject(fields)])} disabled={ctx.disabled}>
          <Plus aria-hidden />
          {addLabel}
        </Button>
      ) : null}
    </fieldset>
  );
}

function HoursEditor({ id, label, hintText, value, path, ctx }: { id: string; label: string; hintText?: string; value: FormValue | undefined; path: (string | number)[]; ctx: RenderContext }) {
  const t = useTranslations("onboarding");
  const rows = Array.isArray(value) ? (value as FormObject[]) : [];
  const error = ctx.errorAt(joinPath(path));
  const setRows = (next: FormObject[]) => ctx.onChange(path, next);
  const update = (i: number, key: string, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <fieldset id={id} className="grid gap-3">
      <legend className="text-base font-semibold text-ink">{label}</legend>
      <p className="-mt-1 text-sm text-muted">{hintText ?? t("form.hours.hint")}</p>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      <ol className="grid gap-3">
        {rows.map((r, i) => {
          const rowError = ctx.errorAt(joinPath([...path, i, "closes"])) ?? ctx.errorAt(joinPath([...path, i, "opens"]));
          return (
            <li key={i} className="grid gap-2 rounded-md border border-border bg-surface p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <label className="grid gap-1.5 text-sm font-semibold text-ink">
                  {t("form.hours.day")}
                  <select value={str(r.day)} onChange={(e) => update(i, "day", e.target.value)} disabled={ctx.disabled} className={fieldControlClass}>
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>
                        {t(`weekdays.${d}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-ink">
                  {t("form.hours.opens")}
                  <Input type="time" value={str(r.opens)} onChange={(e) => update(i, "opens", e.target.value)} disabled={ctx.disabled} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-ink">
                  {t("form.hours.closes")}
                  <Input type="time" value={str(r.closes)} onChange={(e) => update(i, "closes", e.target.value)} disabled={ctx.disabled} />
                </label>
                <Button variant="quiet" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={ctx.disabled} aria-label={t("form.removeItem", { number: i + 1 })}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {rowError ? <p className="text-sm font-medium text-danger">{rowError}</p> : null}
            </li>
          );
        })}
      </ol>
      {rows.length < 28 ? (
        <Button variant="secondary" className="w-fit" onClick={() => setRows([...rows, { day: "mon", opens: "", closes: "" }])} disabled={ctx.disabled}>
          <Plus aria-hidden />
          {t("form.hours.add")}
        </Button>
      ) : null}
    </fieldset>
  );
}
