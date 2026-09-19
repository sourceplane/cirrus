import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Subscription", robots: { index: false } };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const ok = status === "ok";
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">{ok ? "You're subscribed" : "That link didn't work"}</h1>
      <p className="mt-3 text-muted">
        {ok
          ? `Thanks for confirming. New issues from ${site.name} land in your inbox.`
          : "The confirmation link is invalid or was already used. Subscribe again to get a fresh one."}
      </p>
      <p className="mt-6"><Link href={ok ? "/" : "/subscribe"} className="text-accent underline">{ok ? "Back to the site" : "Subscribe again"}</Link></p>
    </div>
  );
}
