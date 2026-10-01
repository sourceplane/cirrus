"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { publicPagePath } from "@/lib/product";
import { useToast } from "@/components/ui/toast";

/**
 * "View public page" is a nav destination, but the public URL depends on the
 * creator's handle — which the static nav cannot know. This route resolves it
 * and forwards, or sends the creator to the editor when there is no page yet.
 */
export default function PreviewRedirect() {
  const { client } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const page = useApiQuery(qk.myPage(), () => wrap(async () => (await client.pages.getMyPage()).page));

  React.useEffect(() => {
    if (page.loading) return;
    if (page.data) {
      router.replace(publicPagePath(page.data.handle));
      return;
    }
    toast({ kind: "error", title: "No page yet", description: "Claim a handle and your page goes live." });
    router.replace("/page");
  }, [page.loading, page.data, router, toast]);

  return <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">Opening your page…</div>;
}
