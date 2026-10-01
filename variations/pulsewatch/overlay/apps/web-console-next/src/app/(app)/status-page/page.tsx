"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { statusPagePath } from "@/lib/product";
import { handleValid } from "@/components/monitors/model";

export default function StatusPageSettings() {
  const { client } = useSession();
  const { toast } = useToast();
  const page = useApiQuery(qk.statusPage(), () => wrap(async () => (await client.monitors.getStatusPage()).statusPage));
  const [form, setForm] = React.useState({ handle: "", title: "", description: "", isPublic: false });
  const [seeded, setSeeded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (seeded || page.loading) return;
    const p = page.data;
    setForm({
      handle: p?.handle ?? "",
      title: p?.title ?? "",
      description: p?.description ?? "",
      isPublic: p?.isPublic ?? false,
    });
    setSeeded(true);
  }, [page.data, page.loading, seeded]);

  const handleOk = handleValid(form.handle);
  const titleOk = form.title.trim().length >= 1 && form.title.trim().length <= 60;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleOk || !titleOk) return;
    setSaving(true);
    const r = await wrap(() =>
      client.monitors.upsertStatusPage({
        handle: form.handle.trim().toLowerCase(),
        title: form.title.trim(),
        description: form.description || null,
        isPublic: form.isPublic,
      }),
    );
    setSaving(false);
    if (!r.ok) {
      toast({ kind: "error", title: r.status === 409 ? "That handle is taken" : "Could not save", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: form.isPublic ? "Status page is live" : "Status page saved" });
    page.reload();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Status page</h1>
          <p className="text-sm text-muted-foreground">One public page your users can check when something feels wrong.</p>
        </div>
        {page.data?.isPublic && (
          <Button asChild variant="outline" size="sm">
            <Link href={statusPagePath(page.data.handle)} target="_blank">
              View page <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </header>

      {page.loading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{page.data ? "Page settings" : "Set up your status page"}</CardTitle>
            <CardDescription>
              {page.data ? `pulsewatch.app${statusPagePath(page.data.handle)}` : "Pick the address people will visit."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={save}>
              <div className="space-y-1.5">
                <Label>Handle</Label>
                <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="acme" maxLength={32} required />
                <p className={form.handle && !handleOk ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  3–32 lowercase letters, digits, hyphens or underscores.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Acme status" maxLength={60} required />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={280} placeholder="Live status of the Acme API and dashboard." />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Public</div>
                  <div className="text-xs text-muted-foreground">
                    Anyone with the link can see monitor names, uptime and incidents — never your URLs.
                  </div>
                </div>
                <Switch checked={form.isPublic} onCheckedChange={(isPublic) => setForm({ ...form, isPublic })} />
              </div>
              <Button type="submit" loading={saving} disabled={!handleOk || !titleOk}>
                Save status page
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
