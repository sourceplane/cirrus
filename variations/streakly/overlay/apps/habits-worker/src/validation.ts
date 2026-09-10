// Pure input rules for the habits surface — mirrored by the console form model
// and unit-tested on their own.

import type { Cadence } from "@saas/db/habits";

export const CADENCES: Cadence[] = ["daily", "weekdays", "weekly_target"];
export const COLOR_RE = /^#[0-9a-f]{6}$/i;

export interface HabitValues {
  name: string;
  cadence: Cadence;
  targetPerWeek: number | null;
  color: string | null;
}

/**
 * Validate create (`partial: false`) or patch (`partial: true`) fields.
 * `currentCadence` is the stored cadence, so a patch that changes only the
 * target is judged against the cadence it will actually have.
 */
export function validateHabit(
  body: Record<string, unknown>,
  partial: boolean,
  currentCadence?: Cadence,
): { ok: true; value: Partial<HabitValues> & { archived?: boolean } } | { ok: false; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  const value: Partial<HabitValues> & { archived?: boolean } = {};

  if (body.name !== undefined || !partial) {
    if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 60) {
      fields.name = ["Name must be 1–60 characters"];
    } else value.name = body.name.trim();
  }

  let cadence: Cadence | undefined = currentCadence;
  if (body.cadence !== undefined) {
    if (typeof body.cadence !== "string" || !CADENCES.includes(body.cadence as Cadence)) {
      fields.cadence = ["Cadence must be daily, weekdays or weekly_target"];
    } else {
      cadence = body.cadence as Cadence;
      value.cadence = cadence;
    }
  } else if (!partial) {
    cadence = "daily";
    value.cadence = cadence;
  }

  // The target and the cadence are one rule: a weekly-target habit needs a
  // number, and the calendar cadences must not carry one.
  const wantsTarget = cadence === "weekly_target";
  if (body.targetPerWeek !== undefined && body.targetPerWeek !== null) {
    if (!Number.isInteger(body.targetPerWeek) || (body.targetPerWeek as number) < 1 || (body.targetPerWeek as number) > 7) {
      fields.targetPerWeek = ["Target must be a whole number between 1 and 7"];
    } else if (!wantsTarget) {
      fields.targetPerWeek = ["Only a weekly-target habit takes a target"];
    } else {
      value.targetPerWeek = body.targetPerWeek as number;
    }
  } else if (wantsTarget) {
    if (body.targetPerWeek === null) {
      fields.targetPerWeek = ["A weekly-target habit needs a target"];
    } else if (value.cadence === "weekly_target" && (!partial || body.cadence !== undefined)) {
      // Switching to (or creating with) weekly_target without a target.
      fields.targetPerWeek = ["A weekly-target habit needs a target"];
    }
  } else if (value.cadence !== undefined && !wantsTarget) {
    // Moving off weekly_target clears the stored target.
    value.targetPerWeek = null;
  }

  if (body.color !== undefined) {
    if (body.color === null) value.color = null;
    else if (typeof body.color !== "string" || !COLOR_RE.test(body.color)) fields.color = ["Colour must be a #rrggbb value"];
    else value.color = body.color.toLowerCase();
  }

  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") fields.archived = ["Archived must be a boolean"];
    else value.archived = body.archived;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value };
}

export function validateNote(value: unknown): { ok: true; value: string | null } | { ok: false; reason: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string" || value.length > 280) return { ok: false, reason: "Note must be at most 280 characters" };
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}
