import { Fragment, type ReactNode } from "react";
import { isSafeDocumentHref } from "@/components/payments/money";
import { Link } from "@/i18n/navigation";
import type { RichTextBlock, RichTextDoc, RichTextInline } from "./content-source";

/**
 * Renders CMS rich text as React elements only (never innerHTML). Unknown node types are skipped,
 * unsafe links render as plain text. Internal links ("/faq") are localized via next-intl.
 */
export function RichText({ doc, className }: { doc: RichTextDoc; className?: string }) {
  return <div className={className}>{doc.blocks.map((b, i) => renderBlock(b, i))}</div>;
}

/** Plain text of a document, for search and metadata. */
export function richTextToPlain(doc: RichTextDoc): string {
  const inline = (nodes: RichTextInline[]) =>
    nodes.map((n) => (n.type === "text" ? n.text : n.type === "link" ? n.children.map((c) => c.text).join("") : "")).join("");
  return doc.blocks
    .map((b) => (b.type === "list" ? b.items.map(inline).join(" ") : b.type === "paragraph" || b.type === "heading" ? inline(b.children) : ""))
    .filter(Boolean)
    .join(" ");
}

function renderBlock(block: RichTextBlock, key: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={key} className="measure mb-4 text-lg leading-relaxed text-ink last:mb-0">
          {renderInlines(block.children)}
        </p>
      );
    case "heading": {
      const H = block.level === 2 ? "h2" : "h3";
      return (
        <H key={key} className={block.level === 2 ? "mt-8 mb-3 font-display text-2xl text-ink" : "mt-6 mb-2 text-xl font-semibold text-ink"}>
          {renderInlines(block.children)}
        </H>
      );
    }
    case "list": {
      const L = block.style === "ordered" ? "ol" : "ul";
      return (
        <L key={key} className={`measure mb-4 grid gap-1 pl-6 text-lg text-ink ${block.style === "ordered" ? "list-decimal" : "list-disc"}`}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInlines(item)}</li>
          ))}
        </L>
      );
    }
    default:
      return null;
  }
}

function renderText(node: { text: string; marks?: ("bold" | "italic")[] }, key: number): ReactNode {
  let out: ReactNode = node.text;
  if (node.marks?.includes("italic")) out = <em>{out}</em>;
  if (node.marks?.includes("bold")) out = <strong>{out}</strong>;
  return <Fragment key={key}>{out}</Fragment>;
}

function renderInlines(nodes: RichTextInline[]): ReactNode {
  return nodes.map((n, i) => {
    if (n.type === "text") return renderText(n, i);
    if (n.type === "link") {
      const children = n.children.map((c, j) => renderText(c, j));
      if (!isSafeDocumentHref(n.href)) return <Fragment key={i}>{children}</Fragment>;
      return n.href.startsWith("/") ? (
        <Link key={i} href={n.href} className="font-medium text-forest underline underline-offset-4">
          {children}
        </Link>
      ) : (
        <a key={i} href={n.href} rel="noopener noreferrer nofollow" target="_blank" className="font-medium text-forest underline underline-offset-4">
          {children}
        </a>
      );
    }
    return null;
  });
}
