"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, type ReactNode } from "react";
import { useMotionOk } from "@/components/motion/use-motion-ok";
import { cx } from "@/components/ui/cx";
import styles from "./hero.module.css";

// three.js lives only in this lazy chunk; it is never requested unless every motion check passes.
const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false, loading: () => null });

/** The poster (server-rendered, passed in as children) is always present; the scene fades in over it. */
export function HeroVisual({ children }: { children: ReactNode }) {
  const ok = useMotionOk("scene");
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const sceneShown = ok && ready;

  return (
    <div className={styles.visual} aria-hidden="true" data-scene={sceneShown ? "live" : "poster"}>
      <div className={cx(styles.layer, sceneShown && styles.hidden)}>{children}</div>
      {ok ? <HeroScene className={cx(styles.layer, !ready && styles.hidden)} onReady={onReady} /> : null}
    </div>
  );
}
