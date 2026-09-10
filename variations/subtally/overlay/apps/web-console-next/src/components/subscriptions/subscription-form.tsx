"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExpenseCadence, PublicTrackedSubscription } from "@saas/contracts/subscriptions";
import {
  CADENCES,
  CATEGORIES,
  CATEGORY_LABELS,
  emptySubscriptionForm,
  parseAmountInput,
  validateSubscriptionForm,
  type Category,
  type SubscriptionFormValues,
} from "./model";

export interface SubscriptionSubmitValues {
  name: string;
  amountCents: number;
  currency: string;
  cadence: ExpenseCadence;
  intervalDays: number | null;
  anchorDate: string;
  category: string;
  url: string | null;
  notes: string | null;
}

export function subscriptionToForm(s: PublicTrackedSubscription): SubscriptionFormValues {
  return {
    name: s.name,
    amount: (s.amountCents / 100).toFixed(2),
    currency: s.currency,
    cadence: s.cadence,
    intervalDays: String(s.intervalDays ?? 30),
    anchorDate: s.anchorDate,
    category: (s.category as Category) ?? "other",
    url: s.url ?? "",
    notes: s.notes ?? "",
  };
}

export function SubscriptionForm({
  initial,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  initial?: SubscriptionFormValues;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: SubscriptionSubmitValues) => void;
  onCancel?: (() => void) | undefined;
}) {
  const [v, setV] = React.useState<SubscriptionFormValues>(initial ?? emptySubscriptionForm());
  const [touched, setTouched] = React.useState(false);
  const errors = validateSubscriptionForm(v);
  const valid = Object.keys(errors).length === 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!valid) return;
        onSubmit({
          name: v.name.trim(),
          amountCents: parseAmountInput(v.amount)!,
          currency: v.currency.trim().toUpperCase(),
          cadence: v.cadence,
          intervalDays: v.cadence === "custom" ? Number(v.intervalDays) : null,
          anchorDate: v.anchorDate,
          category: v.category,
          url: v.url.trim() === "" ? null : v.url.trim(),
          notes: v.notes.trim() === "" ? null : v.notes,
        });
      }}
    >
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} placeholder="Netflix" required />
        {touched && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1.5">
          <Label>Amount</Label>
          <Input value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="12.99" inputMode="decimal" required />
          {touched && errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Input value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} maxLength={3} />
          {touched && errors.currency && <p className="text-xs text-destructive">{errors.currency}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cadence</Label>
          <Select value={v.cadence} onValueChange={(cadence) => setV({ ...v, cadence: cadence as ExpenseCadence })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CADENCES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {v.cadence === "custom" && (
          <div className="space-y-1.5">
            <Label>Every N days</Label>
            <Input type="number" min={1} max={3650} value={v.intervalDays} onChange={(e) => setV({ ...v, intervalDays: e.target.value })} />
            {touched && errors.intervalDays && <p className="text-xs text-destructive">{errors.intervalDays}</p>}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Next or last billing date</Label>
          <Input type="date" value={v.anchorDate} onChange={(e) => setV({ ...v, anchorDate: e.target.value })} required />
          <p className="text-xs text-muted-foreground">Every renewal is worked out from this date.</p>
          {touched && errors.anchorDate && <p className="text-xs text-destructive">{errors.anchorDate}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={v.category} onValueChange={(category) => setV({ ...v, category: category as Category })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Manage link</Label>
        <Input type="url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://netflix.com/account" />
        {touched && errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} maxLength={1000} placeholder="Shared with family; renews on the card ending 4242." />
        {touched && errors.notes && <p className="text-xs text-destructive">{errors.notes}</p>}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={saving} disabled={touched && !valid}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
