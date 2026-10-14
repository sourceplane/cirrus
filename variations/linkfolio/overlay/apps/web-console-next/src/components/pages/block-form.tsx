"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BlockKind } from "@saas/contracts/pages";
import { BLOCK_KINDS, parsePriceInput, validateBlockForm, type BlockFormValues } from "./model";

export interface BlockSubmitValues {
  kind: BlockKind;
  title: string;
  url: string | null;
  description: string | null;
  priceCents: number | null;
  currency: string | null;
}

/**
 * Add/edit form for one block. `lockKind` is set when editing — a block's kind
 * decides its shape, and the worker refuses to change it.
 */
export function BlockForm({
  initial,
  submitLabel,
  saving,
  lockKind = false,
  onSubmit,
  onCancel,
}: {
  initial: BlockFormValues;
  submitLabel: string;
  saving: boolean;
  lockKind?: boolean;
  onSubmit: (values: BlockSubmitValues) => void;
  onCancel?: (() => void) | undefined;
}) {
  const [v, setV] = React.useState<BlockFormValues>(initial);
  const [touched, setTouched] = React.useState(false);
  const errors = validateBlockForm(v);
  const valid = Object.keys(errors).length === 0;
  const priced = v.kind === "product" || v.kind === "tip";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!valid) return;
        const price = parsePriceInput(v.price);
        onSubmit({
          kind: v.kind,
          title: v.title.trim(),
          url: v.kind === "header" ? null : v.url.trim(),
          description: v.description.trim() === "" ? null : v.description.trim(),
          priceCents: priced ? price : null,
          currency: priced && price !== null ? v.currency.trim().toUpperCase() : null,
        });
      }}
    >
      {!lockKind && (
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={v.kind} onValueChange={(kind) => setV((s) => ({ ...s, kind: kind as BlockKind }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOCK_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{BLOCK_KINDS.find((k) => k.value === v.kind)?.hint}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={v.title} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} maxLength={80} placeholder="My newsletter" required />
        {touched && errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </div>

      {v.kind !== "header" && (
        <div className="space-y-1.5">
          <Label>Link</Label>
          <Input type="url" value={v.url} onChange={(e) => setV((s) => ({ ...s, url: e.target.value }))} placeholder="https://example.com" required />
          {touched && errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={v.description} onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))} rows={2} maxLength={280} placeholder="Optional — one line under the title." />
        {touched && errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
      </div>

      {priced && (
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-1.5">
            <Label>Price</Label>
            <Input value={v.price} onChange={(e) => setV((s) => ({ ...s, price: e.target.value }))} placeholder="12.99" inputMode="decimal" />
            {touched && errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input value={v.currency} onChange={(e) => setV((s) => ({ ...s, currency: e.target.value.toUpperCase() }))} maxLength={3} />
            {touched && errors.currency && <p className="text-xs text-destructive">{errors.currency}</p>}
          </div>
        </div>
      )}

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
