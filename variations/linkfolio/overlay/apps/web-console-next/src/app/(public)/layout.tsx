"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

/**
 * Public shell for creator pages: no session required, no app chrome. The
 * page itself is the content, so this is deliberately almost empty — just a
 * way back for a signed-in creator and a sign-in for everyone else.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  return (
    <div className="min-h-screen bg-background">
      <div className="absolute right-3 top-3 z-10">
        {token ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/page">Edit my page</Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>
      <main>{children}</main>
    </div>
  );
}
