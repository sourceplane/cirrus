"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;

export default function MakerProfilePage() {
  const { client } = useSession();
  const { toast } = useToast();
  const profile = useApiQuery(qk.myMakerProfile(), () => wrap(async () => (await client.launches.getMyProfile()).maker));
  const account = useApiQuery(qk.profile(), () => wrap(async () => (await client.auth.getProfile()).user));
  const [form, setForm] = React.useState({ handle: "", displayName: "", bio: "", websiteUrl: "", twitter: "" });
  const [saving, setSaving] = React.useState(false);
  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (seeded || profile.loading) return;
    const m = profile.data;
    setForm({
      handle: m?.handle ?? "",
      displayName: m?.displayName ?? account.data?.displayName ?? "",
      bio: m?.bio ?? "",
      websiteUrl: m?.websiteUrl ?? "",
      twitter: m?.twitter ?? "",
    });
    if (!account.loading) setSeeded(true);
  }, [profile.data, profile.loading, account.data, account.loading, seeded]);

  const handle = form.handle.trim().toLowerCase();
  const handleOk = HANDLE_RE.test(handle);
  const nameOk = form.displayName.trim().length >= 1 && form.displayName.trim().length <= 60;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleOk || !nameOk) return;
    setSaving(true);
    const r = await wrap(() =>
      client.launches.upsertMyProfile({
        handle,
        displayName: form.displayName.trim(),
        bio: form.bio || null,
        websiteUrl: form.websiteUrl || null,
        twitter: form.twitter || null,
      }),
    );
    setSaving(false);
    if (!r.ok) {
      toast({ kind: "error", title: r.status === 409 ? "That handle is taken" : "Could not save", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: "Profile saved" });
    profile.reload();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Maker profile</h1>
        <p className="text-sm text-muted-foreground">What the directory shows next to your launches.</p>
      </header>
      {profile.loading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{profile.data ? "Your public profile" : "Create your profile"}</CardTitle>
            <CardDescription>
              {profile.data ? (
                <Link href={`/makers/${profile.data.handle}`} className="inline-flex items-center gap-1 underline">
                  /makers/{profile.data.handle} <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                "Required before your first launch."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={save}>
              <div className="space-y-1.5">
                <Label>Handle</Label>
                <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="jane_doe" maxLength={32} required />
                <p className={form.handle && !handleOk ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>3–32 lowercase letters, digits, hyphens or underscores.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Jane Doe" maxLength={60} required />
              </div>
              <div className="space-y-1.5">
                <Label>Bio</Label>
                <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={280} rows={3} placeholder="Indie maker. Building in public." />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Website</Label>
                  <Input type="url" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://jane.dev" />
                </div>
                <div className="space-y-1.5">
                  <Label>Twitter / X</Label>
                  <Input value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} placeholder="@jane" maxLength={16} />
                </div>
              </div>
              <Button type="submit" loading={saving} disabled={!handleOk || !nameOk}>
                {profile.data ? "Save changes" : "Create profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
