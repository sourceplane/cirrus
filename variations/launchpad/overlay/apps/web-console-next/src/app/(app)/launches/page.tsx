"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rocket, Plus, Pencil, Archive, Trash2, MoreHorizontal, ExternalLink } from "lucide-react";
import type { PublicProduct } from "@saas/contracts/launches";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { ProductCard } from "@/components/launches/product-card";

export default function MyLaunchesPage() {
  const { client } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const mine = useApiQuery(qk.myLaunches(), () => wrap(async () => (await client.launches.listMine()).products));
  const profile = useApiQuery(qk.myMakerProfile(), () => wrap(async () => (await client.launches.getMyProfile()).maker));
  const [pendingDelete, setPendingDelete] = React.useState<PublicProduct | null>(null);

  const launch = async (p: PublicProduct) => {
    const r = await wrap(() => client.launches.launch(p.id));
    if (!r.ok) {
      if (r.error.reason === "maker_profile_required" || r.status === 412) {
        toast({ kind: "error", title: "Create your maker profile first", description: "Your launch shows who made it." });
        router.push("/profile");
        return;
      }
      toast({ kind: "error", title: "Could not launch", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: `${p.name} is live`, description: `Share it: /explore/${r.data.product.slug}` });
    mine.reload();
  };

  const archive = async (p: PublicProduct, status: "archived" | "draft") => {
    const r = await wrap(() => client.launches.update(p.id, { status }));
    if (!r.ok) {
      toast({ kind: "error", title: "Update failed", description: r.error.message });
      return;
    }
    mine.reload();
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const r = await wrap(() => client.launches.delete(pendingDelete.id));
    if (!r.ok) {
      toast({ kind: "error", title: "Delete failed", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: "Launch deleted" });
    mine.reload();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My launches</h1>
          <p className="text-sm text-muted-foreground">Drafts stay private until you launch them into the directory.</p>
        </div>
        <Button asChild>
          <Link href="/launches/new">
            <Plus className="h-4 w-4" /> Submit a launch
          </Link>
        </Button>
      </header>

      {!profile.loading && profile.data === null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Set up your maker profile</CardTitle>
            <CardDescription>Pick a handle and a display name — every launch links back to it.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/profile">Create profile</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {mine.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : mine.error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Could not load your launches</CardTitle>
            <CardDescription>{mine.error.message}</CardDescription>
          </CardHeader>
        </Card>
      ) : mine.data && mine.data.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="Nothing launched yet"
          description="Submit your first product. It starts as a draft you can polish before it goes live."
          primaryAction={{ label: "Submit a launch", href: "/launches/new" }}
          secondaryAction={{ label: "See what others launched", href: "/explore" }}
        />
      ) : (
        <div className="space-y-3">
          {mine.data!.map((p) => (
            <div key={p.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ProductCard product={p} showStatus href={`/launches/${p.id}`} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  {p.status !== "live" && (
                    <DropdownMenuItem onSelect={() => void launch(p)}>
                      <Rocket className="h-4 w-4 opacity-70" /> {p.status === "archived" ? "Re-launch" : "Launch now"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => router.push(`/launches/${p.id}`)}>
                    <Pencil className="h-4 w-4 opacity-70" /> Edit
                  </DropdownMenuItem>
                  {p.status === "live" && (
                    <DropdownMenuItem onSelect={() => window.open(`/explore/${p.slug}`, "_blank")}>
                      <ExternalLink className="h-4 w-4 opacity-70" /> View public page
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {p.status === "live" ? (
                    <DropdownMenuItem onSelect={() => void archive(p, "archived")}>
                      <Archive className="h-4 w-4 opacity-70" /> Archive
                    </DropdownMenuItem>
                  ) : p.status === "archived" ? (
                    <DropdownMenuItem onSelect={() => void archive(p, "draft")}>
                      <Archive className="h-4 w-4 opacity-70" /> Back to draft
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem className="text-destructive" onSelect={() => setPendingDelete(p)}>
                    <Trash2 className="h-4 w-4 opacity-70" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this launch?"
        description="Its upvotes and comments are deleted with it. This cannot be undone."
        resourceName={pendingDelete?.name}
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}
