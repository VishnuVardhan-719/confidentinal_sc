import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/modules/auth/actions";

/**
 * Sign-out as a plain form post (works without JS). The server action clears the httpOnly
 * session cookies even if the backend call fails, then redirects to the localized sign-in page.
 * Private pages are rendered no-store, so nothing private remains cached client-side.
 */
export function SignOutButton({ locale, label, variant = "secondary" }: { locale: string; label: string; variant?: "secondary" | "quiet" | "primary" }) {
  return (
    <form action={logoutAction}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant={variant}>
        <LogOut aria-hidden />
        {label}
      </Button>
    </form>
  );
}
