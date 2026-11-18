"use client";

import { useTranslations } from "next-intl";
import { useId, type ComponentPropsWithRef } from "react";
import { cn } from "@/components/ui/cn";
import { fieldControlClass } from "@/components/ui/input";
import { normalizeIndianMobile } from "./input-format";

/**
 * Indian mobile number (national digits) with a fixed, visible +91 prefix that is also announced to
 * assistive tech through aria-describedby. `onValueChange` receives the normalised digits: a pasted
 * "+91 98765-43210" becomes "9876543210"; over-long input is kept so validation can reject it.
 * Use inside <Field>; validate with `isValidIndianMobile`.
 */
export function PhoneInput({
  value,
  onValueChange,
  className,
  "aria-describedby": describedBy,
  ...props
}: Omit<ComponentPropsWithRef<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (digits: string) => void;
}) {
  const t = useTranslations("common.phone");
  const prefixId = useId();
  return (
    <div className={cn("flex items-stretch", className)}>
      <span
        id={prefixId}
        className="inline-flex min-h-target items-center rounded-l-md border border-r-0 border-border-strong bg-paper-deep px-3 font-medium text-ink tabular"
      >
        <span aria-hidden>+91</span>
        <span className="sr-only">{t("prefix")}</span>
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        {...props}
        aria-describedby={[prefixId, describedBy].filter(Boolean).join(" ")}
        value={value}
        onChange={(e) => onValueChange(normalizeIndianMobile(e.target.value))}
        className={cn(fieldControlClass, "rounded-l-none tabular tracking-wide")}
      />
    </div>
  );
}
