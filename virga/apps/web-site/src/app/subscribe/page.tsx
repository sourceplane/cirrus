import type { Metadata } from "next";
import { SubscribeForm } from "@/components/SubscribeForm";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Subscribe" };

export default function SubscribePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">{site.copy.subscribeTitle}</h1>
      <p className="mb-6 mt-2 text-muted">{site.copy.subscribeBlurb}</p>
      <SubscribeForm source="subscribe" />
    </div>
  );
}
