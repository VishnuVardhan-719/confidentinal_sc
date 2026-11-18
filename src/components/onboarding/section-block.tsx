"use client";

import { useTranslations } from "next-intl";
import { Notice } from "@/components/shared/notice";
import { cn } from "@/components/ui/cn";
import { fieldControlClass } from "@/components/ui/input";
import { FieldRenderer, ListEditor, type RenderContext } from "./field-renderer";
import { emptyObject, fieldDomId, type FormObject, type FormValue, type SectionFormState, type SectionSpec } from "./form-spec";
import { setAt } from "./state-path";

/**
 * Renders one onboarding section from its spec. Field paths are prefixed with `sectionId`
 * (e.g. "personal.fullName") so server validation paths and ErrorSummary links line up.
 */
export function SectionBlock({
  sectionId,
  spec,
  state,
  onState,
  ctx,
}: {
  sectionId: string;
  spec: SectionSpec;
  state: SectionFormState;
  onState: (next: SectionFormState) => void;
  ctx: Omit<RenderContext, "onChange">;
}) {
  const t = useTranslations("onboarding");

  if (spec.kind === "readonly" || state.kind === "readonly") return null;

  if (spec.kind === "fields" && state.kind === "fields") {
    const onChange = (path: (string | number)[], value: FormValue) => {
      // Paths arrive prefixed with the section id; strip it for the section's own object.
      const [, ...rest] = path;
      onState({ kind: "fields", values: setAt(state.values, rest, value) });
    };
    return (
      <div className="grid gap-6">
        {spec.fields.map((f) => (
          <FieldRenderer key={f.name} spec={f} value={state.values[f.name]} path={[sectionId, f.name]} ctx={{ ...ctx, onChange }} />
        ))}
      </div>
    );
  }

  if (spec.kind === "answer" && state.kind === "answer") {
    const stateId = fieldDomId(`${sectionId}.state`);
    const stateError = ctx.errorAt(`${sectionId}.state`) ?? ctx.errorAt(sectionId);
    const known = spec.known;
    return (
      <div className="grid gap-5">
        <fieldset id={stateId} className="grid gap-2" aria-describedby={stateError ? `${stateId}-error` : undefined}>
          <legend className="text-base font-semibold text-ink">{ctx.tr(`answers.${spec.answerSet}.legend`)}</legend>
          {stateError ? (
            <p id={`${stateId}-error`} className="text-sm font-medium text-danger">
              {stateError}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3">
            {spec.states.map((s) => {
              const optionId = `${stateId}-${s}`;
              return (
                <label
                  key={s}
                  htmlFor={optionId}
                  className={cn(
                    "flex min-h-target cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2",
                    state.state === s && "border-forest bg-mist",
                  )}
                >
                  <input
                    id={optionId}
                    type="radio"
                    name={stateId}
                    value={s}
                    checked={state.state === s}
                    onChange={() => onState({ ...state, state: s })}
                    disabled={ctx.disabled}
                    className="size-5 accent-forest"
                  />
                  <span className="text-base text-ink">{ctx.tr(`answers.${spec.answerSet}.${s}`)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {state.state === "known" && known.kind === "list" ? (
          <ListEditor
            id={fieldDomId(`${sectionId}.${known.name}`)}
            label={ctx.tr(`answers.${spec.answerSet}.listLabel`)}
            error={ctx.errorAt(`${sectionId}.${known.name}`)}
            rows={state.items}
            max={known.max}
            addLabel={ctx.tr(known.addKey)}
            fields={known.fields}
            path={[sectionId, known.name]}
            ctx={{
              ...ctx,
              onChange: (path, value) => {
                // path = [section, listName] (whole list) or [section, listName, i, field...]
                const [, , ...rest] = path;
                const items = rest.length === 0 ? (value as FormObject[]) : (setAt({ items: state.items }, ["items", ...rest], value).items as FormObject[]);
                onState({ ...state, items });
              },
            }}
          />
        ) : null}

        {state.state === "known" && known.kind === "select" ? (
          <div className="grid gap-2">
            <label htmlFor={fieldDomId(`${sectionId}.${known.name}`)} className="text-base font-semibold text-ink">
              {ctx.tr(`answers.${spec.answerSet}.valueLabel`)}
            </label>
            {ctx.errorAt(`${sectionId}.${known.name}`) ? (
              <p className="text-sm font-medium text-danger">{ctx.errorAt(`${sectionId}.${known.name}`)}</p>
            ) : null}
            <select
              id={fieldDomId(`${sectionId}.${known.name}`)}
              value={state.value}
              onChange={(e) => onState({ ...state, value: e.target.value })}
              disabled={ctx.disabled}
              className={cn(fieldControlClass, "max-w-xs")}
            >
              <option value="">{t("form.choose")}</option>
              {known.options.map((o) => (
                <option key={o} value={o}>
                  {ctx.tr(`options.${known.optionSet}.${o}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {state.state === "known" && known.kind === "unavailable" ? (
          <Notice tone="neutral" icon="lock">
            {ctx.tr(`answers.${spec.answerSet}.unavailable`)}
          </Notice>
        ) : null}
      </div>
    );
  }

  return null;
}

/** Fresh state for an answer section with no rows yet. */
export const ensureRow = (spec: SectionSpec, state: SectionFormState): SectionFormState =>
  spec.kind === "answer" && state.kind === "answer" && spec.known.kind === "list" && state.items.length === 0
    ? { ...state, items: [emptyObject(spec.known.fields)] }
    : state;
