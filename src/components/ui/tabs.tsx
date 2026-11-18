"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:thin]", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex min-h-target items-center border-b-2 border-transparent px-4 text-base font-medium whitespace-nowrap text-muted",
        "transition-colors duration-(--scv-duration-fast) hover:text-ink",
        "data-[state=active]:border-forest data-[state=active]:text-forest",
        "focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus",
        "disabled:text-disabled-text",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-6 focus-visible:outline-3 focus-visible:outline-focus", className)} {...props} />;
}
