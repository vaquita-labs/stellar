export type CsvRow = Record<string, string | number | null | undefined>;

const escape = (v: string | number | null | undefined) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: CsvRow[], columns?: string[]): string {
  if (rows.length === 0) return '';
  const cols = columns ?? Object.keys(rows[0]!);
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))];
  return lines.join('\n');
}
