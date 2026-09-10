"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, GripVertical, LayoutList, Pencil, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { PublicBlock } from "@saas/contracts/pages";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { publicPagePath } from "@/lib/product";
import { BlockForm, type BlockSubmitValues } from "@/components/pages/block-form";
import { blockToForm, emptyBlockForm, formatPrice, handleValid, moveItem } from "@/components/pages/model";

export default function PageEditor() {
  const { client } = useSession();
  const { toast } = useToast();
  const page = useApiQuery(qk.myPage(), () => wrap(async () => (await client.pages.getMyPage()).page));
  const blocks = useApiQuery(qk.myBlocks(), () => wrap(async () => (await client.pages.listBlocks()).blocks));

  const [form, setForm] = React.useState({ handle: "", title: "", bio: "", published: false });
  const [seeded, setSeeded] = React.useState(false);
  const [savingPage, setSavingPage] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [savingBlock, setSavingBlock] = React.useState(false);
  const [editing, setEditing] = React.useState<PublicBlock | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<PublicBlock | null>(null);

  React.useEffect(() => {
    if (seeded || page.loading) return;
    const p = page.data;
    setForm({ handle: p?.handle ?? "", title: p?.title ?? "", bio: p?.bio ?? "", published: p?.published ?? false });
    setSeeded(true);
  }, [page.data, page.loading, seeded]);

  const handleOk = handleValid(form.handle);
  const titleOk = form.title.trim().length >= 1 && form.title.trim().length <= 60;

  const savePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleOk || !titleOk) return;
    setSavingPage(true);
    const r = await wrap(() =>
      client.pages.upsertMyPage({
        handle: form.handle.trim().toLowerCase(),
        title: form.title.trim(),
        bio: form.bio || null,
        ...(page.data?.theme ? { theme: page.data.theme } : {}),
        published: form.published,
      }),
    );
    setSavingPage(false);
    if (!r.ok) {
      toast({ kind: "error", title: r.status === 409 ? "That handle is taken" : "Could not save", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: form.published ? "Page published" : "Page saved" });
    page.reload();
  };

  const addBlock = async (values: BlockSubmitValues) => {
    setSavingBlock(true);
    const r = await wrap(() => client.pages.createBlock(values));
    setSavingBlock(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Could not add block", description: r.error.message });
      return;
    }
    setAdding(false);
    blocks.reload();
  };

  const saveBlock = async (values: BlockSubmitValues) => {
    if (!editing) return;
    setSavingBlock(true);
    const { kind: _kind, ...patch } = values;
    const r = await wrap(() => client.pages.updateBlock(editing.id, patch));
    setSavingBlock(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Could not save block", description: r.error.message });
      return;
    }
    setEditing(null);
    blocks.reload();
  };

  const toggleBlock = async (b: PublicBlock, enabled: boolean) => {
    const r = await wrap(() => client.pages.updateBlock(b.id, { enabled }));
    if (!r.ok) {
      toast({ kind: "error", title: "Could not update", description: r.error.message });
      return;
    }
    blocks.reload();
  };

  const move = async (b: PublicBlock, direction: "up" | "down") => {
    const ids = (blocks.data ?? []).map((x) => x.id);
    const next = moveItem(ids, b.id, direction);
    if (next === ids) return;
    const r = await wrap(() => client.pages.reorderBlocks({ ids: next }));
    if (!r.ok) {
      toast({ kind: "error", title: "Could not reorder", description: r.error.message });
      return;
    }
    blocks.reload();
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const r = await wrap(() => client.pages.deleteBlock(pendingDelete.id));
    if (!r.ok) {
      toast({ kind: "error", title: "Delete failed", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: "Block deleted" });
    blocks.reload();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My page</h1>
          <p className="text-sm text-muted-foreground">One link that holds everything you want to share.</p>
        </div>
        {page.data?.published && (
          <Button asChild variant="outline" size="sm">
            <Link href={publicPagePath(page.data.handle)} target="_blank">
              View page <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </header>

      {page.loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{page.data ? "Page details" : "Claim your handle"}</CardTitle>
            <CardDescription>
              {page.data ? `linkfolio.app${publicPagePath(page.data.handle)}` : "Pick the address people will visit."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={savePage}>
              <div className="space-y-1.5">
                <Label>Handle</Label>
                <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="jane" maxLength={32} required />
                <p className={form.handle && !handleOk ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  3–32 lowercase letters, digits, hyphens or underscores.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Jane Doe" maxLength={60} required />
              </div>
              <div className="space-y-1.5">
                <Label>Bio</Label>
                <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} maxLength={280} placeholder="Designer. Writing about type and tools." />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Published</div>
                  <div className="text-xs text-muted-foreground">An unpublished page is not reachable by anyone.</div>
                </div>
                <Switch checked={form.published} onCheckedChange={(published) => setForm({ ...form, published })} />
              </div>
              <Button type="submit" loading={savingPage} disabled={!handleOk || !titleOk}>
                Save page
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Blocks</CardTitle>
            <CardDescription>Links, sections, products and tips, in the order they appear.</CardDescription>
          </div>
          {!adding && (
            <Button size="sm" onClick={() => { setAdding(true); setEditing(null); }}>
              <Plus className="h-4 w-4" /> Add block
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {adding && (
            <div className="rounded-lg border p-4">
              <BlockForm initial={emptyBlockForm()} submitLabel="Add block" saving={savingBlock} onSubmit={addBlock} onCancel={() => setAdding(false)} />
            </div>
          )}

          {blocks.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : blocks.data && blocks.data.length === 0 && !adding ? (
            <EmptyState
              icon={LayoutList}
              title="No blocks yet"
              description="Add your first link, then anything else you want on the page."
              primaryAction={{ label: "Add block", onClick: () => setAdding(true) }}
            />
          ) : (
            <ul className="space-y-2">
              {(blocks.data ?? []).map((b, i, all) => (
                <li key={b.id} className="rounded-lg border">
                  {editing?.id === b.id ? (
                    <div className="p-4">
                      <BlockForm initial={blockToForm(b)} submitLabel="Save block" saving={savingBlock} lockKind onSubmit={saveBlock} onCancel={() => setEditing(null)} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3">
                      <div className="flex flex-col">
                        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => void move(b, "up")} className="text-muted-foreground disabled:opacity-30 hover:text-foreground">
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                        <button type="button" aria-label="Move down" disabled={i === all.length - 1} onClick={() => void move(b, "down")} className="text-muted-foreground disabled:opacity-30 hover:text-foreground">
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{b.title}</span>
                          <Badge variant="secondary">{b.kind}</Badge>
                          {b.priceCents !== null && <span className="text-xs text-muted-foreground">{formatPrice(b.priceCents, b.currency)}</span>}
                        </div>
                        {b.url && <div className="truncate text-xs text-muted-foreground">{b.url}</div>}
                      </div>
                      <Switch checked={b.enabled} onCheckedChange={(enabled) => void toggleBlock(b, enabled)} aria-label="Enabled" />
                      <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => { setEditing(b); setAdding(false); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Delete" className="text-destructive" onClick={() => setPendingDelete(b)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this block?"
        description="Its click history is deleted with it. This cannot be undone."
        resourceName={pendingDelete?.title}
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}
