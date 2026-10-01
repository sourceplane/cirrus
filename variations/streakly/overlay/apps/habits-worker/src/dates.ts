// Calendar helpers over `YYYY-MM-DD` strings.
//
// Every date in this product is the CLIENT's local calendar date: the browser
// decides what "today" is and sends it. These helpers therefore do plain
// calendar arithmetic with no timezone in sight — the UTC constructors are an
// implementation detail chosen because they never shift a date across a
// daylight-saving boundary.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toKey(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return toDate(date).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const d = dayOfWeek(date);
  return d === 0 || d === 6;
}

/** The Monday of the week `date` falls in. */
export function weekStartOf(date: string): string {
  const dow = dayOfWeek(date);
  // Sunday belongs to the week that started six days earlier.
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(date, -back);
}

/** `n` days ending at `date`, oldest first. */
export function lastNDays(date: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(date, -i));
  return out;
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}
