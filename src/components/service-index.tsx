import Link from "next/link";

export type ServiceIndexItem = { slug: string; name: string; summary: string; boundary: string };

/** Hairline index of the service categories. Each row is one large link target. */
export function ServiceIndex({
  items,
  headingLevel = "h3",
}: {
  items: readonly ServiceIndexItem[];
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <ul className="service-index">
      {items.map((item) => (
        <li className="service-item" key={item.slug}>
          <Heading className="service-name">
            <Link className="service-link" href={`/categories/${item.slug}`}>
              {item.name}
            </Link>
          </Heading>
          <p className="service-summary">{item.summary}</p>
          <p className="service-boundary">{item.boundary}</p>
          <svg className="service-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 12h15m-6-6 6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </li>
      ))}
    </ul>
  );
}
