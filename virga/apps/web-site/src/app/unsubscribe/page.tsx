import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Unsubscribed", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const ok = status === "ok";
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">{ok ? "You're unsubscribed" : "That link didn't work"}</h1>
      <p className="mt-3 text-muted">
        {ok ? "Sorry to see you go. You won't get any more email from here." : "The unsubscribe link is invalid. Use the link at the bottom of any issue."}
      </p>
      <p className="mt-6"><Link href="/" className="text-accent underline">Back to the site</Link></p>
    </div>
  );
}
