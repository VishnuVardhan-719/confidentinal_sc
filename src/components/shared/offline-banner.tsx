"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Notice } from "./notice";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Shows only while the browser reports offline. Nothing is queued; actions need the server. */
export function OfflineBanner({ className }: { className?: string }) {
  const t = useTranslations("common.offline");
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <div role="status" aria-live="polite" className={className}>
      {online ? null : (
        <Notice tone="warning" icon="offline" title={t("title")}>
          {t("body")}
        </Notice>
      )}
    </div>
  );
}
