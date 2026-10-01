"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { compact } from "@/lib/format";

export function ViewCount({ slug }: { slug: string }) {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.views(slug).then((r) => {
      if (!cancelled && r.ok) setTotal(r.value.total);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  if (total === null) return null;
  return <span className="text-sm text-muted">{compact(total)} {total === 1 ? "view" : "views"}</span>;
}
