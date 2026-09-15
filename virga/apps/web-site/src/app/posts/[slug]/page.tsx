import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubscribeBox } from "@/components/SubscribeBox";
import { UpvoteButton } from "@/components/UpvoteButton";
import { ViewBeacon } from "@/components/ViewBeacon";
import { ViewCount } from "@/components/ViewCount";
import { engagementSlug } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { posts, sections } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return posts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = posts().find((p) => p.slug === slug);
  return post ? { title: post.data.title, description: post.data.summary } : {};
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts().find((p) => p.slug === slug);
  if (!post) notFound();
  const key = engagementSlug(post);
  return (
    <article className="mx-auto max-w-2xl">
      <ViewBeacon slug={key} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{post.data.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <time dateTime={post.data.date}>{formatDate(post.data.date)}</time>
          <ViewCount slug={key} />
          {post.data.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </p>
      </header>
      <div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} />
      <div className="mt-10 flex items-center gap-4">
        <UpvoteButton slug={key} />
        <span className="text-sm text-muted">Found this useful? Say so.</span>
      </div>
      {sections().subscribe ? <div className="mt-12"><SubscribeBox source={`post/${post.slug}`} /></div> : null}
    </article>
  );
}
