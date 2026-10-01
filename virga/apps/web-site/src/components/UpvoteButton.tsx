"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function UpvoteButton({ slug, initial = 0 }: { slug: string; initial?: number }) {
  const [count, setCount] = useState(initial);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.reactions(slug).then((r) => {
      if (cancelled || !r.ok) return;
      setCount(r.value.counts.upvote);
      setActive(r.value.viewer.upvote);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const r = await api.react(slug, "upvote");
    if (r.ok) {
      setCount(r.value.counts.upvote);
      setActive(r.value.viewer.upvote);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      disabled={busy}
      className={`flex min-w-14 flex-col items-center rounded-md border px-3 py-2 text-sm leading-tight transition ${
        active ? "border-accent bg-accent text-accent-ink" : "border-line bg-card hover:border-accent"
      }`}
      title={active ? "Remove upvote" : "Upvote"}
    >
      <span aria-hidden="true">▲</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </button>
  );
}
