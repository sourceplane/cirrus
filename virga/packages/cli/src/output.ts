// Tables for humans, JSON for scripts.

export function table(rows: Array<Record<string, string | number | null>>, columns: string[]): string[] {
  if (rows.length === 0) return ["(none)"];
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ").trimEnd();
  return [line(columns), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(columns.map((c) => String(r[c] ?? ""))))];
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
