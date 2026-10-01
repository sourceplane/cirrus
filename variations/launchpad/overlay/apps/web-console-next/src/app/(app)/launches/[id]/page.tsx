"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Rocket, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { ProductForm, productToForm } from "@/components/launches/product-form";
import { statusLabel } from "@/components/launches/model";

export default function EditLaunchPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { client } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const product = useApiQuery(qk.myLaunch(id), () => wrap(async () => (await client.launches.getMine(id)).product), { enabled: !!id });
  const [saving, setSaving] = React.useState(false);
  const [launching, setLaunching] = React.useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.myLaunches() });
    product.reload();
  };

  const launch = async () => {
    setLaunching(true);
    const r = await wrap(() => client.launches.launch(id));
    setLaunching(false);
    if (!r.ok) {
      if (r.status === 412) {
        toast({ kind: "error", title: "Create your maker profile first" });
        router.push("/profile");
        return;
      }
      toast({ kind: "error", title: "Could not launch", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: `${r.data.product.name} is live` });
    refresh();
  };

  const p = product.data;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <Link href="/launches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> My launches
      </Link>
      {product.loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : product.error || !p ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Launch not found</CardTitle>
            <CardDescription>{product.error?.message ?? "It may have been deleted."}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <Badge variant={statusLabel(p.status).tone}>{statusLabel(p.status).label}</Badge>
                </div>
                <CardDescription>
                  {p.status === "live" ? (
                    <>
                      Live at{" "}
                      <Link href={`/explore/${p.slug}`} className="inline-flex items-center gap-1 underline">
                        /explore/{p.slug} <ExternalLink className="h-3 w-3" />
                      </Link>{" "}
                      · {p.upvoteCount} upvotes · {p.commentCount} comments
                    </>
                  ) : (
                    <>Not in the directory yet. Slug: /explore/{p.slug}</>
                  )}
                </CardDescription>
              </div>
              {p.status !== "live" && (
                <Button onClick={launch} loading={launching}>
                  <Rocket className="h-4 w-4" /> Launch now
                </Button>
              )}
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
              <CardDescription>Changes to a live launch show immediately.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductForm
                key={p.updatedAt}
                initial={productToForm(p)}
                submitLabel="Save changes"
                saving={saving}
                onSubmit={async (values) => {
                  setSaving(true);
                  const r = await wrap(() => client.launches.update(id, values));
                  setSaving(false);
                  if (!r.ok) {
                    toast({ kind: "error", title: "Could not save", description: r.error.message });
                    return;
                  }
                  toast({ kind: "success", title: "Saved" });
                  refresh();
                }}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
