"use client";

import { useTranslations } from "next-intl";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/components/ui/cn";
import { fieldControlClass } from "@/components/ui/input";
import { normalizeIndianMobile } from "./input-format";

/**
 * Indian mobile number (national 10 digits) with a fixed +91 prefix. `onValueChange` receives the
 * normalised digits; pasted "+91 98765-43210" becomes "9876543210". Use inside <Field>.
 */
export function PhoneInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentPropsWithRef<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (digits: string) => void;
}) {
  const t = useTranslations("common.phone");
  return (
    <div className={cn("flex items-stretch", className)}>
      <span
        aria-hidden
        className="inline-flex min-h-target items-center rounded-l-md border border-r-0 border-border-strong bg-paper-deep px-3 font-medium text-ink tabular"
      >
        +91
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        aria-label={props["aria-label"]}
        {...props}
        value={value}
        onChange={(e) => onValueChange(normalizeIndianMobile(e.target.value))}
        title={t("format")}
        className={cn(fieldControlClass, "rounded-l-none tabular tracking-wide")}
      />
    </div>
  );
}
