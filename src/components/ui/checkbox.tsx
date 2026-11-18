"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check, Minus } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

const boxClass = cn(
  "peer inline-flex size-5 shrink-0 items-center justify-center border-2 border-border-strong bg-surface text-on-forest",
  "transition-colors duration-(--scv-duration-fast) hover:border-ink",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "data-[state=checked]:border-forest data-[state=checked]:bg-forest data-[state=indeterminate]:border-forest data-[state=indeterminate]:bg-forest",
  "aria-invalid:border-danger disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled",
);

/** 20px visual box; wrap with a <label> spanning >=44px for the touch target. */
export function Checkbox({ className, ...props }: ComponentPropsWithRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn(boxClass, "rounded-[5px]", className)} {...props}>
      <CheckboxPrimitive.Indicator className="group flex items-center justify-center">
        <Check aria-hidden className="size-3.5 group-data-[state=indeterminate]:hidden" strokeWidth={3} />
        <Minus aria-hidden className="hidden size-3.5 group-data-[state=indeterminate]:block" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const RadioGroup = ({ className, ...props }: ComponentPropsWithRef<typeof RadioGroupPrimitive.Root>) => (
  <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} />
);

export function RadioGroupItem({ className, ...props }: ComponentPropsWithRef<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(boxClass, "rounded-full bg-surface data-[state=checked]:bg-surface", className)}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="block size-2.5 rounded-full bg-forest" />
    </RadioGroupPrimitive.Item>
  );
}
