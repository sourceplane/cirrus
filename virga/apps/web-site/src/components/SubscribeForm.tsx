"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; status: "pending" | "confirmed" } | { kind: "error"; message: string };

export function SubscribeForm({ source, compact = false }: { source: string; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "busy") return;
    setState({ kind: "busy" });
    const result = await api.subscribe(email, source);
    if (result.ok) setState({ kind: "done", status: result.value.status });
    else if (result.error.code === "validation_failed") setState({ kind: "error", message: "That doesn't look like an email address." });
    else if (result.error.code === "rate_limited") setState({ kind: "error", message: "Too many tries — give it a few minutes." });
    else setState({ kind: "error", message: "Couldn't reach the server. Try again in a moment." });
  }

  if (state.kind === "done") {
    return (
      <p className="rounded-md border border-line bg-card p-4 text-sm" role="status">
        {state.status === "pending" ? "Check your inbox — confirm the link to finish subscribing." : "You're already subscribed. Thanks for reading."}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={compact ? "flex gap-2" : "flex flex-col gap-3 sm:flex-row"} aria-label="Subscribe">
      <label className="sr-only" htmlFor={`email-${source}`}>Email address</label>
      <input
        id={`email-${source}`}
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-2 text-base outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={state.kind === "busy"}
        className="rounded-md bg-accent px-4 py-2 font-medium text-accent-ink disabled:opacity-60"
      >
        {state.kind === "busy" ? "Sending…" : "Subscribe"}
      </button>
      {state.kind === "error" ? <p className="basis-full text-sm text-accent" role="alert">{state.message}</p> : null}
    </form>
  );
}
