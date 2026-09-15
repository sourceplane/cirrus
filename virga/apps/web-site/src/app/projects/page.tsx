import type { Metadata } from "next";
import { projects, site } from "@/lib/site";

export const metadata: Metadata = { title: site.copy.projects };

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold tracking-tight">{site.copy.projects}</h1>
      <ul className="grid gap-5 sm:grid-cols-2">
        {projects().map((p) => (
          <li key={p.slug} className="rounded-lg border border-line bg-card p-6">
            <h2 className="text-xl font-semibold">
              {p.data.url ? <a href={p.data.url} className="hover:underline">{p.data.title}</a> : p.data.title}
            </h2>
            <p className="mt-1 text-muted">{p.data.summary}</p>
            <div className="prose mt-3 text-sm" dangerouslySetInnerHTML={{ __html: p.html }} />
            <p className="mt-3 text-sm text-muted">
              {p.data.repo ? <a href={`https://github.com/${p.data.repo}`} className="hover:text-ink">{p.data.repo}</a> : null}
              {p.data.tags.map((t) => (
                <span key={t} className="ml-2">#{t}</span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
