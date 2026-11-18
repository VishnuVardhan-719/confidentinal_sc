import styles from "./motion.module.css";

export type Step = { title: string; body: string };

function Connector({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const vertical = orientation === "vertical";
  return (
    <svg
      className={`${styles.connector} ${vertical ? styles.vertical : styles.horizontal}`}
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={vertical ? "0.5" : "0"}
        y1={vertical ? "0" : "0.5"}
        x2={vertical ? "0.5" : "100%"}
        y2={vertical ? "100%" : "0.5"}
        stroke="currentColor"
        strokeWidth="1"
        data-reveal-draw=""
      />
    </svg>
  );
}

/**
 * The request steps as a numbered track. The connector is SVG so RevealScope can draw it;
 * without motion it is simply a static line, identical to the CSS version.
 */
export function StepTrack({ steps, headingLevel = "h3" }: { steps: readonly Step[]; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <div className={styles.trackWrap} data-reveal-track="">
      <Connector orientation="vertical" />
      <Connector orientation="horizontal" />
      <ol className="track">
        {steps.map((s) => (
          <li key={s.title} data-reveal-step="">
            <Heading>{s.title}</Heading>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
