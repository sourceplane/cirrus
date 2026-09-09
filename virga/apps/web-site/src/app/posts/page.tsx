import type { Metadata } from "next";
import Link from "next/link";
import { SubscribeBox } from "@/components/SubscribeBox";
import { formatDate } from "@/lib/format";
import { posts, sections, site } from "@/lib/site";

export const metadata: Metadata = { title: site.copy.posts };

export default function PostsPage() {
  const all = posts();
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-3xl font-semibold tracking-tight">{site.copy.posts}</h1>
      <ul className="flex flex-col divide-y divide-line">
        {all.map((p) => (
          <li key={p.slug} className="py-5">
            <Link href={`/posts/${p.slug}`} className="text-xl font-semibold hover:underline">{p.data.title}</Link>
            <p className="mt-1 text-muted">{p.data.summary}</p>
            <p className="mt-1 text-sm text-muted">{formatDate(p.data.date)}</p>
          </li>
        ))}
      </ul>
      {sections().subscribe ? <SubscribeBox source="posts" /> : null}
    </div>
  );
}
