import type { RichTextDoc, RichTextInline } from "@/modules/content/schema";

/**
 * Renders approved rich-text nodes as React elements. Never uses
 * dangerouslySetInnerHTML; text is always escaped by React. Public pages can
 * reuse this for published stories and FAQ answers.
 */
function Inline({ nodes }: { nodes: readonly RichTextInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === "link") {
          const external = n.href.startsWith("https://");
          return (
            <a key={i} href={n.href} className="text-forest underline underline-offset-4" {...(external ? { rel: "noopener noreferrer nofollow" } : {})}>
              {n.children.map((c) => c.text).join("")}
            </a>
          );
        }
        const bold = n.marks?.includes("bold");
        const italic = n.marks?.includes("italic");
        if (bold && italic)
          return (
            <strong key={i}>
              <em>{n.text}</em>
            </strong>
          );
        if (bold) return <strong key={i}>{n.text}</strong>;
        if (italic) return <em key={i}>{n.text}</em>;
        return <span key={i}>{n.text}</span>;
      })}
    </>
  );
}

export function RichText({ doc }: { doc: RichTextDoc }) {
  return (
    <div className="grid gap-4 text-base text-ink">
      {doc.blocks.map((b, i) => {
        if (b.type === "heading") {
          const H = b.level === 2 ? "h3" : "h4";
          return (
            <H key={i} className="font-semibold text-ink">
              <Inline nodes={b.children} />
            </H>
          );
        }
        if (b.type === "list") {
          const L = b.style === "bullet" ? "ul" : "ol";
          return (
            <L key={i} className={b.style === "bullet" ? "list-disc pl-6" : "list-decimal pl-6"}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline nodes={item} />
                </li>
              ))}
            </L>
          );
        }
        return (
          <p key={i} className="measure">
            <Inline nodes={b.children} />
          </p>
        );
      })}
    </div>
  );
}
