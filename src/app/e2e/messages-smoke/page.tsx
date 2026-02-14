"use client";

import { useState } from "react";

type FixtureThread = {
  id: string;
  title: string;
  preview: string;
  unreadCount: number;
};

type FixtureMessage = {
  id: number;
  body: string;
};

export default function MessagesSmokeFixturePage() {
  const [threads, setThreads] = useState<FixtureThread[]>([
    {
      id: "thread-1",
      title: "Eleve Demo",
      preview: "Message initial",
      unreadCount: 0,
    },
  ]);
  const [messages, setMessages] = useState<FixtureMessage[]>([
    { id: 1, body: "Message initial" },
  ]);
  const [draft, setDraft] = useState("");

  const unreadBadge = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);

  const sendMessage = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    const nextMessage: FixtureMessage = {
      id: Date.now(),
      body: trimmed,
    };

    setMessages((current) => [...current, nextMessage]);
    setThreads((current) =>
      current.map((thread) =>
        thread.id === "thread-1"
          ? {
              ...thread,
              preview: trimmed,
              unreadCount: 1,
            }
          : thread
      )
    );
    setDraft("");
  };

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-lg font-semibold text-[var(--text)]">Fixture Messages Smoke</h1>
      <div className="rounded-2xl border border-white/10 bg-[var(--panel)] p-4">
        <p className="text-sm text-[var(--text)]">Badge notifications</p>
        <p data-testid="messages-badge" className="mt-1 text-2xl font-semibold text-[var(--text)]">
          {unreadBadge}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <section className="rounded-2xl border border-white/10 bg-[var(--panel)] p-3">
          {threads.map((thread) => (
            <div key={thread.id} data-testid="messages-inbox-item" className="rounded-xl bg-white/5 p-3">
              <p className="text-sm font-semibold text-[var(--text)]">{thread.title}</p>
              <p data-testid="messages-inbox-preview" className="mt-1 text-xs text-[var(--muted)]">
                {thread.preview}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[var(--panel)] p-3">
          <div className="space-y-2">
            {messages.map((message) => (
              <p key={message.id} data-testid="messages-thread-message" className="rounded-xl bg-white/5 px-3 py-2 text-sm text-[var(--text)]">
                {message.body}
              </p>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Nouveau message"
              className="flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
            />
            <button
              type="button"
              onClick={sendMessage}
              data-testid="messages-send"
              className="rounded-full bg-emerald-300/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-950"
            >
              Envoyer
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
