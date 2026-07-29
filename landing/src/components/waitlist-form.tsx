"use client";

import { FormEvent, useState } from "react";

type WaitlistFormProps = {
  id?: string;
  ctaLabel?: string;
  className?: string;
  compact?: boolean;
};

export function WaitlistForm({
  id = "waitlist",
  ctaLabel = "Join the waitlist",
  className = "",
  compact = false,
}: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }

      setStatus("done");
      setMessage("You're on the list. We'll email when iOS TestFlight opens.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again in a moment.");
    }
  }

  if (status === "done") {
    return (
      <p
        className={`font-mono text-[13px] leading-relaxed text-ink/70 ${className}`}
        role="status"
      >
        {message}
      </p>
    );
  }

  return (
    <form
      id={id}
      onSubmit={onSubmit}
      className={`flex w-full flex-col gap-3 ${compact ? "sm:flex-row sm:items-stretch" : "sm:flex-row sm:items-center"} ${className}`}
    >
      <label className="sr-only" htmlFor={`${id}-email`}>
        Email
      </label>
      <input
        id={`${id}-email`}
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="min-h-[56px] flex-1 rounded-[15px] border border-ink/20 bg-card px-5 font-sans text-[16px] text-ink outline-none placeholder:text-ink/40 focus:border-accent"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="min-h-[56px] shrink-0 rounded-[15px] bg-accent px-8 font-serif text-[19px] text-paper shadow-[0_2px_0_rgba(35,31,24,0.16)] transition-colors hover:bg-accent-pressed disabled:opacity-70"
      >
        {status === "loading" ? "Saving…" : ctaLabel}
      </button>
      {message && status === "error" ? (
        <p className="w-full font-mono text-[12px] text-accent" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
