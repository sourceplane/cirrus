"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { HttpMethod, PublicMonitor } from "@saas/contracts/monitors";
import { INTERVALS, METHODS, emptyMonitorForm, validateMonitorForm, type MonitorFormValues } from "./model";

export interface MonitorSubmitValues {
  name: string;
  url: string;
  method: HttpMethod;
  intervalSec: number;
  expectedStatus: number;
}

export function monitorToForm(m: PublicMonitor): MonitorFormValues {
  return {
    name: m.name,
    url: m.url,
    method: m.method,
    intervalSec: String(m.intervalSec),
    expectedStatus: String(m.expectedStatus),
  };
}

export function MonitorForm({
  initial,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  initial?: MonitorFormValues;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: MonitorSubmitValues) => void;
  onCancel?: (() => void) | undefined;
}) {
  const [v, setV] = React.useState<MonitorFormValues>(initial ?? emptyMonitorForm());
  const [touched, setTouched] = React.useState(false);
  const errors = validateMonitorForm(v);
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
          url: v.url.trim(),
          method: v.method,
          intervalSec: Number(v.intervalSec),
          expectedStatus: Number(v.expectedStatus),
        });
      }}
    >
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} placeholder="API" required />
        {touched && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>URL</Label>
        <Input type="url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://api.example.com/health" required />
        <p className="text-xs text-muted-foreground">Must be reachable from the public internet.</p>
        {touched && errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Method</Label>
          <Select value={v.method} onValueChange={(method) => setV({ ...v, method: method as HttpMethod })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Interval</Label>
          <Select value={v.intervalSec} onValueChange={(intervalSec) => setV({ ...v, intervalSec })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((i) => (
                <SelectItem key={i.value} value={String(i.value)}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Expected status</Label>
          <Input type="number" min={100} max={599} value={v.expectedStatus} onChange={(e) => setV({ ...v, expectedStatus: e.target.value })} />
          {touched && errors.expectedStatus && <p className="text-xs text-destructive">{errors.expectedStatus}</p>}
        </div>
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
