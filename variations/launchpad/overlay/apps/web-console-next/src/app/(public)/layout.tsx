"use client";

import * as React from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { PRODUCT_LABEL } from "@/lib/product";

/**
 * Public shell for the directory: no session required, no sidebar. Signed-in
 * visitors get a shortcut into their own launches; everyone else a Sign in.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 md:px-6">
          <Link href="/explore" className="inline-flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-primary/40 text-primary-foreground">
              <Rocket className="h-4 w-4" />
            </span>
            {PRODUCT_LABEL}
          </Link>
          <nav className="ml-auto flex items-center gap-2">
            {token ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/launches">My launches</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/launches/new">Submit</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/login">Submit a launch</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
