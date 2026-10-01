"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseTagInput, previewSlug, validateProductForm, type ProductFormValues } from "./model";
import type { PublicProduct } from "@saas/contracts/launches";

export function productToForm(p: PublicProduct | null): ProductFormValues {
  return {
    name: p?.name ?? "",
    tagline: p?.tagline ?? "",
    url: p?.url ?? "",
    description: p?.description ?? "",
    tags: p?.tags.join(", ") ?? "",
  };
}

export function ProductForm({
  initial,
  submitLabel,
  saving,
  onSubmit,
  showSlugPreview = false,
}: {
  initial: ProductFormValues;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: { name: string; tagline: string; url: string; description: string; tags: string[] }) => void;
  showSlugPreview?: boolean;
}) {
  const [v, setV] = React.useState<ProductFormValues>(initial);
  const [touched, setTouched] = React.useState(false);
  const errors = validateProductForm(v);
  const valid = Object.keys(errors).length === 0;
  const set = (k: keyof ProductFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!valid) return;
        onSubmit({ name: v.name.trim(), tagline: v.tagline.trim(), url: v.url.trim(), description: v.description, tags: parseTagInput(v.tags) });
      }}
    >
      <Field label="Name" error={touched ? errors.name : undefined} hint={showSlugPreview && v.name ? `launchpad.app/explore/${previewSlug(v.name) || "…"}` : undefined}>
        <Input value={v.name} onChange={set("name")} placeholder="Acme Notes" maxLength={60} required />
      </Field>
      <Field label="Tagline" error={touched ? errors.tagline : undefined}>
        <Input value={v.tagline} onChange={set("tagline")} placeholder="Notes that sync everywhere, instantly" maxLength={120} required />
      </Field>
      <Field label="Website" error={touched ? errors.url : undefined}>
        <Input type="url" value={v.url} onChange={set("url")} placeholder="https://acme.dev" required />
      </Field>
      <Field label="Description" error={touched ? errors.description : undefined} hint="Markdown is not rendered; plain text.">
        <Textarea value={v.description} onChange={set("description")} rows={6} placeholder="What it does, who it is for, what is new." />
      </Field>
      <Field label="Tags" error={touched ? errors.tags : undefined} hint="Up to 5, comma-separated.">
        <Input value={v.tags} onChange={set("tags")} placeholder="productivity, ai, developer-tools" />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" loading={saving} disabled={touched && !valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string | undefined; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
