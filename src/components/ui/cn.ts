import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about the custom font-size tokens so `text-display` is not
// mistaken for a text colour and dropped when merged with `text-ink`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
