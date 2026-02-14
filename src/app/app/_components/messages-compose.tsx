"use client";

import { FormEvent, useState } from "react";

type MessagesComposeProps = {
  disabled?: boolean;
  sending: boolean;
  onSend: (body: string) => Promise<void>;
};

export default function MessagesCompose({
  disabled = false,
  sending,
  onSend,
}: MessagesComposeProps) {
  const [body, setBody] = useState("");
  const isDisabled = disabled || sending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || isDisabled) return;

    setBody("");
    try {
      await onSend(trimmed);
    } catch {
      setBody(trimmed);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-2xl bg-[var(--panel)] p-3">
      <label className="block text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        Message
      </label>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Ecrire un message..."
        rows={3}
        maxLength={2000}
        disabled={isDisabled}
        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40 disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">{body.length}/2000</p>
        <button
          type="submit"
          disabled={isDisabled || body.trim().length === 0}
          className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
        >
          {sending ? "Envoi..." : "Envoyer"}
        </button>
      </div>
    </form>
  );
}
