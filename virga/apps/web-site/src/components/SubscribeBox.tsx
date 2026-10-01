import { site } from "@/lib/site";
import { SubscribeForm } from "./SubscribeForm";

export function SubscribeBox({ source }: { source: string }) {
  return (
    <section className="rounded-lg border border-line bg-card p-6">
      <h2 className="text-xl font-semibold tracking-tight">{site.copy.subscribeTitle}</h2>
      <p className="mb-4 mt-1 text-muted">{site.copy.subscribeBlurb}</p>
      <SubscribeForm source={source} />
    </section>
  );
}
