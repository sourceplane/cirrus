"use client";

import * as React from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { PRODUCT_LABEL } from "@/lib/product";

/**
 * Public shell for status pages: no session required, no app chrome. A status
 * page is read by people who are already having a bad minute, so it stays
 * plain and fast.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4 md:px-6">
          <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Activity className="h-4 w-4" /> {PRODUCT_LABEL}
          </span>
          <div className="ml-auto">
            <Button asChild variant="ghost" size="sm">
              <Link href={token ? "/monitors" : "/login"}>{token ? "My monitors" : "Sign in"}</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}
