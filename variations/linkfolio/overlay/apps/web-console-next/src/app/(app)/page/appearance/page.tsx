"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ACCENTS, DEFAULT_ACCENT } from "@/components/pages/model";

export default function AppearancePage() {
  const { client } = useSession();
  const { toast } = useToast();
  const page = useApiQuery(qk.myPage(), () => wrap(async () => (await client.pages.getMyPage()).page));
  const [accent, setAccent] = React.useState<string>(DEFAULT_ACCENT);
  const [layout, setLayout] = React.useState<"list" | "grid">("list");
  const [seeded, setSeeded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (seeded || page.loading || !page.data) return;
    setAccent(page.data.theme.accent ?? DEFAULT_ACCENT);
    setLayout(page.data.theme.layout ?? "list");
    setSeeded(true);
  }, [page.data, page.loading, seeded]);

  const save = async () => {
    const p = page.data;
    if (!p) return;
    setSaving(true);
    const r = await wrap(() =>
      client.pages.upsertMyPage({
        handle: p.handle,
        title: p.title,
        bio: p.bio,
        theme: { accent, layout },
        published: p.published,
      }),
    );
    setSaving(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Could not save", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: "Appearance saved" });
    page.reload();
  };

  if (page.loading) return <Skeleton className="h-64 w-full max-w-2xl rounded-xl" />;
  if (!page.data) {
    return (
      <EmptyState
        title="Claim a handle first"
        description="Appearance applies to your public page, so it needs one."
        primaryAction={{ label: "Set up my page", href: "/page" }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-sm text-muted-foreground">How your public page looks to visitors.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accent</CardTitle>
          <CardDescription>Used for buttons and highlights on your page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Accent ${c}`}
                aria-pressed={accent === c}
                onClick={() => setAccent(c)}
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-full ring-offset-2 ring-offset-background transition",
                  accent === c && "ring-2 ring-foreground",
                )}
                style={{ backgroundColor: c }}
              >
                {accent === c && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Layout</Label>
            <div className="flex gap-2">
              {(["list", "grid"] as const).map((l) => (
                <Button key={l} type="button" variant={layout === l ? "default" : "outline"} size="sm" onClick={() => setLayout(l)}>
                  {l === "list" ? "Stacked list" : "Two-column grid"}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Preview</div>
            <div className={cn("mt-3 gap-2", layout === "grid" ? "grid grid-cols-2" : "flex flex-col")}>
              {["My newsletter", "Latest project"].map((t) => (
                <div key={t} className="rounded-lg px-3 py-2 text-center text-sm font-medium text-white" style={{ backgroundColor: accent }}>
                  {t}
                </div>
              ))}
            </div>
          </div>

          <Button onClick={save} loading={saving}>
            Save appearance
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
