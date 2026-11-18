import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware navigation. Always use these instead of next/link and next/navigation for app routes. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
