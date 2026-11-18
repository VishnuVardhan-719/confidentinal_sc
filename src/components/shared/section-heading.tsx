import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function SectionHeading({
  id,
  title,
  description,
  as: Tag = "h2",
  size = "lg",
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  as?: "h2" | "h3";
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", className)}>
      <Tag
        id={id}
        className={cn(
          "font-display font-medium tracking-[-0.02em] text-ink",
          size === "lg" ? "text-3xl" : "text-2xl",
        )}
      >
        {title}
      </Tag>
      {description ? <div className="measure text-lg text-muted">{description}</div> : null}
    </div>
  );
}
