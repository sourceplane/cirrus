import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pages } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return pages().map((p) => ({ page: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const { page } = await params;
  const entry = pages().find((p) => p.slug === page);
  return entry ? { title: entry.data.title } : {};
}

export default async function ContentPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const entry = pages().find((p) => p.slug === page);
  if (!entry) notFound();
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">{entry.data.title}</h1>
      <div className="prose" dangerouslySetInnerHTML={{ __html: entry.html }} />
    </article>
  );
}
