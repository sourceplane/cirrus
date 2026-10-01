"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { wrap } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { ProductForm, productToForm } from "@/components/launches/product-form";

export default function NewLaunchPage() {
  const { client } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [saving, setSaving] = React.useState(false);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <Link href="/launches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> My launches
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submit a launch</CardTitle>
          <CardDescription>Saved as a draft. Launch it from My launches when it is ready.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductForm
            initial={productToForm(null)}
            submitLabel="Save draft"
            saving={saving}
            showSlugPreview
            onSubmit={async (values) => {
              setSaving(true);
              const r = await wrap(() => client.launches.create(values));
              setSaving(false);
              if (!r.ok) {
                toast({ kind: "error", title: r.status === 409 ? "That name is taken" : "Could not save", description: r.error.message });
                return;
              }
              void qc.invalidateQueries({ queryKey: qk.myLaunches() });
              toast({ kind: "success", title: "Draft saved" });
              router.push(`/launches/${r.data.product.id}`);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
