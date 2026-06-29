import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataTableColumn<Row> {
  /** Stable key; also used as the default cell accessor when `render` is omitted. */
  key: string;
  /** Column header label (rendered in the mono uppercase head row). */
  header: React.ReactNode;
  /** Custom cell renderer. Receives the full row plus its index. */
  render?: (row: Row, index: number) => React.ReactNode;
  /** Extra classes applied to both the header cell and body cells. */
  className?: string;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Optional accessor for a stable React key per row (defaults to index). */
  rowKey?: (row: Row, index: number) => string;
  /** Content shown when `rows` is empty. */
  empty?: React.ReactNode;
  className?: string;
}

/**
 * DataTable — a thin generic table built on the shared UI table primitives. It
 * keeps the admin pages declarative: pass `columns` (with optional per-cell
 * renderers) and `rows`. When a column has no `render`, it reads `row[key]`.
 * Renders an empty-state row spanning all columns when there is no data.
 */
export function DataTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  empty = "No records.",
  className,
}: DataTableProps<Row>) {
  return (
    <Table className={className}>
      <THead>
        <TR className="hover:bg-transparent">
          {columns.map((col) => (
            <TH key={col.key} className={cn("whitespace-nowrap", col.className)}>
              {col.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <TR className="hover:bg-transparent">
            <TD
              colSpan={columns.length}
              className="py-10 text-center text-sm text-text-muted"
            >
              {empty}
            </TD>
          </TR>
        ) : (
          rows.map((row, index) => (
            <TR key={rowKey ? rowKey(row, index) : index}>
              {columns.map((col) => (
                <TD key={col.key} className={col.className}>
                  {col.render
                    ? col.render(row, index)
                    : (row[col.key] as React.ReactNode)}
                </TD>
              ))}
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}
