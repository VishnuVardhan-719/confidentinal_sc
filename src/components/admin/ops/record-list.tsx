import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Shown as the card title on small screens. */
  primary?: boolean;
  className?: string;
};

/**
 * Responsive record list: an accessible table from md up, labelled cards below
 * (no horizontal scrolling on phones). Rows use stable server IDs as keys.
 */
export function RecordList<T>({
  label,
  rows,
  columns,
  rowKey,
}: {
  label: string;
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
}) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);
  return (
    <>
      <div className="hidden min-w-0 md:block">
        <Table label={label}>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label={label} className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-lg border border-border bg-surface p-4">
            <div className="font-semibold text-ink">{primary.cell(row)}</div>
            <dl className="mt-3 grid gap-2">
              {rest.map((c) => (
                // Label above value on phones: two columns left too little room for badges and references.
                <div key={c.key} className="grid gap-0.5 text-sm sm:grid-cols-[minmax(7rem,40%)_minmax(0,1fr)] sm:gap-2">
                  <dt className="text-muted">{c.header}</dt>
                  <dd className="min-w-0 text-ink [overflow-wrap:anywhere]">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Definition grid for detail screens: two columns on desktop, one on mobile. */
export function DetailGrid({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1">
          <dt className="text-sm font-medium text-muted">{item.label}</dt>
          <dd className="text-base text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
