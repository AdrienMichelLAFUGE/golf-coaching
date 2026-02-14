"use client";

import type { MessageThreadSummary } from "@/lib/messages/types";

type MessagesThreadListProps = {
  threads: MessageThreadSummary[];
  selectedThreadId: string | null;
  loading: boolean;
  error: string;
  onSelect: (threadId: string) => void;
  onDelete?: (threadId: string) => void | Promise<void>;
  deletingThreadId?: string | null;
};

const formatThreadDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatThreadTitle = (thread: MessageThreadSummary) => {
  if (thread.kind === "group") {
    return thread.groupName ?? "Groupe";
  }

  if (thread.kind === "student_coach") {
    if (thread.studentName && thread.counterpartName) {
      return `${thread.studentName} · ${thread.counterpartName}`;
    }
    if (thread.studentName) return thread.studentName;
  }

  return thread.counterpartName ?? "Conversation";
};

export default function MessagesThreadList({
  threads,
  selectedThreadId,
  loading,
  error,
  onSelect,
  onDelete,
  deletingThreadId = null,
}: MessagesThreadListProps) {
  if (loading) {
    return (
      <section className="rounded-2xl bg-[var(--panel)] p-4">
        <p className="text-sm text-[var(--muted)]">Chargement des conversations...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-[var(--panel)] p-4">
        <p className="text-sm text-red-400">{error}</p>
      </section>
    );
  }

  if (threads.length === 0) {
    return (
      <section className="rounded-2xl bg-[var(--panel)] p-4">
        <p className="text-sm text-[var(--muted)]">Aucune conversation.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-[var(--panel)] p-3">
      <div className="space-y-2">
        {threads.map((thread) => {
          const isSelected = thread.threadId === selectedThreadId;
          return (
            <div
              key={thread.threadId}
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                isSelected
                  ? "border-emerald-300/40 bg-emerald-400/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(thread.threadId)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-[var(--text)]">
                    {formatThreadTitle(thread)}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">
                    {thread.lastMessagePreview ?? "Aucun message"}
                  </p>
                  <p className="mt-2 text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                    {formatThreadDate(thread.lastMessageAt)}
                  </p>
                </button>
                <span className="flex shrink-0 items-center gap-2">
                  {thread.unreadCount > 0 ? (
                    <span className="rounded-full bg-rose-400 px-2 py-0.5 text-[0.65rem] font-semibold text-zinc-900">
                      {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                    </span>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        void onDelete(thread.threadId);
                      }}
                      disabled={deletingThreadId === thread.threadId}
                      className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                    >
                      {deletingThreadId === thread.threadId ? "..." : "Suppr."}
                    </button>
                  ) : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
