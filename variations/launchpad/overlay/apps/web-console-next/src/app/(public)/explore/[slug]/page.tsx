"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ExternalLink, MessageSquare } from "lucide-react";
import type { PublicProduct } from "@saas/contracts/launches";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { UpvoteButton } from "@/components/launches/product-card";
import { displayHost, relativeTime } from "@/components/launches/model";

export default function LaunchPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { client, token } = useSession();
  const { toast } = useToast();
  const product = useApiQuery(qk.launch(slug), () => wrap(async () => (await client.launches.get(slug)).product), { enabled: !!slug });
  const comments = useApiQuery(qk.launchComments(slug), () => wrap(async () => (await client.launches.listComments(slug)).comments), { enabled: !!slug });
  const [draft, setDraft] = React.useState("");
  const [posting, setPosting] = React.useState(false);
  const [local, setLocal] = React.useState<PublicProduct | null>(null);
  const p = local ?? product.data;

  const toggleUpvote = token
    ? async (x: PublicProduct) => {
        const r = await wrap(() => (x.viewerHasUpvoted ? client.launches.removeUpvote(x.slug) : client.launches.upvote(x.slug)));
        if (!r.ok) {
          toast({ kind: "error", title: "Could not vote", description: r.error.message });
          return;
        }
        setLocal({ ...x, upvoteCount: r.data.upvoteCount, viewerHasUpvoted: r.data.viewerHasUpvoted });
      }
    : undefined;

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    const r = await wrap(() => client.launches.addComment(slug, { body: draft.trim() }));
    setPosting(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Could not post", description: r.error.message });
      return;
    }
    setDraft("");
    comments.reload();
    product.reload();
    setLocal(null);
  };

  if (product.loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (product.error || !p) {
    return <EmptyState title="Launch not found" description="It may be a draft, archived, or the link is wrong." primaryAction={{ label: "Back to launches", href: "/explore" }} />;
  }

  return (
    <div className="space-y-6">
      <Link href="/explore" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All launches
      </Link>
      <div className="flex items-start gap-4">
        <UpvoteButton product={p} onUpvote={toggleUpvote} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <p className="mt-1 text-base text-muted-foreground">{p.tagline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Button asChild size="sm">
              <a href={p.url} target="_blank" rel="noreferrer noopener">
                Visit {displayHost(p.url)} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            {p.maker && (
              <Link href={`/makers/${p.maker.handle}`} className="text-muted-foreground hover:text-foreground">
                by <span className="font-medium text-foreground">{p.maker.displayName}</span>
              </Link>
            )}
            <span className="text-muted-foreground">· launched {relativeTime(p.launchedAt)}</span>
          </div>
          {p.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.tags.map((t) => (
                <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {p.description && <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.description}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Comments ({p.commentCount})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {token ? (
            <form className="space-y-2" onSubmit={post}>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2000} placeholder="Ask the maker something, or say congrats." />
              <Button type="submit" size="sm" loading={posting} disabled={!draft.trim()}>
                Post comment
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link href="/login" className="underline">Sign in</Link> to join the conversation.
            </p>
          )}
          {comments.loading ? (
            <Skeleton className="h-16 w-full" />
          ) : comments.data && comments.data.length > 0 ? (
            <ul className="divide-y">
              {comments.data.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="text-xs text-muted-foreground">
                    {c.author ? (
                      <Link href={`/makers/${c.author.handle}`} className="font-medium text-foreground hover:underline">
                        {c.author.displayName}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">A member</span>
                    )}{" "}
                    · {relativeTime(c.createdAt)}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
