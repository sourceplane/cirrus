"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done" } | { kind: "error"; message: string };

export function ContactForm({ form = "contact" }: { form?: string }) {
  const [fields, setFields] = useState({ name: "", email: "", message: "" });
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "busy") return;
    setState({ kind: "busy" });
    const result = await api.submitForm(form, fields, honeypot);
    if (result.ok) setState({ kind: "done" });
    else if (result.error.code === "validation_failed") setState({ kind: "error", message: "Please check the fields and try again." });
    else if (result.error.code === "rate_limited") setState({ kind: "error", message: "Too many messages — give it a few minutes." });
    else setState({ kind: "error", message: "Couldn't reach the server. Try again in a moment." });
  }

  if (state.kind === "done") {
    return <p className="rounded-md border border-line bg-card p-4" role="status">Thanks — your message is in. I read everything.</p>;
  }

  const input = "w-full rounded-md border border-line bg-card px-3 py-2 text-base outline-none focus:border-accent";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Contact">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input className={input} required value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input className={input} type="email" required value={fields.email} onChange={(e) => setFields({ ...fields, email: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Message
        <textarea className={`${input} min-h-32`} required maxLength={4000} value={fields.message} onChange={(e) => setFields({ ...fields, message: e.target.value })} />
      </label>
      {/* Real browsers never fill this; bots do. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      <div className="flex items-center gap-4">
        <button type="submit" disabled={state.kind === "busy"} className="rounded-md bg-accent px-4 py-2 font-medium text-accent-ink disabled:opacity-60">
          {state.kind === "busy" ? "Sending…" : "Send"}
        </button>
        {state.kind === "error" ? <p className="text-sm text-accent" role="alert">{state.message}</p> : null}
      </div>
    </form>
  );
}
