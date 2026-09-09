import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">{site.copy.contactTitle}</h1>
      <p className="mb-6 mt-2 text-muted">{site.copy.contactBlurb}</p>
      <ContactForm />
    </div>
  );
}
