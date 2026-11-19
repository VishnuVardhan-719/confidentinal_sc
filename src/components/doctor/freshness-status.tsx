"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore, useTransition } from "react";
import { RetryAction } from "@/components/shared/retry-action";
import { useRouter } from "@/i18n/navigation";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

/**
 * DC03 status freshness. There is no live transport yet, so the page always says when the status
 * was fetched ("Last updated"), never "live". Offline adds an explicit notice; reconnecting refetches
 * the server data (the server stays the authority, nothing is queued on the client).
 */
export function FreshnessStatus({ time }: { time: string }) {
  const t = useTranslations("doctor.common");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const online = useSyncExternalStore(subscribe, getOnline, getServerOnline);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      startTransition(() => router.refresh());
    }
  }, [online, router]);

  return (
    <p role="status" className="flex flex-wrap items-center gap-3 text-sm text-muted tabular">
      {online ? (
        <span>{t("lastUpdated", { time })}</span>
      ) : (
        <span className="inline-flex items-center gap-2 font-medium text-ink">
          <WifiOff aria-hidden className="size-4 shrink-0" />
          {t("offlineSince", { time })}
        </span>
      )}
      {online ? <RetryAction label={t("refresh")} /> : null}
    </p>
  );
}
