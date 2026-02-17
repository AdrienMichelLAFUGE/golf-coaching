"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MessagesThreadList from "@/app/app/_components/messages-thread-list";
import MessagesThreadView from "@/app/app/_components/messages-thread-view";
import { useThemePreference } from "@/app/app/_components/use-theme-preference";
import {
  MessageInboxResponseSchema,
  MessageThreadMessagesResponseSchema,
  type MessageInboxResponse,
  type MessageThreadMessagesResponse,
} from "@/lib/messages/types";
import { supabase } from "@/lib/supabase/client";

type ParentMessagesShellProps = {
  studentId: string;
};

const readApiError = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? fallback;
};

export default function ParentMessagesShell({ studentId }: ParentMessagesShellProps) {
  useThemePreference();

  const [inbox, setInbox] = useState<MessageInboxResponse>({
    threads: [],
    unreadMessagesCount: 0,
  });
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxError, setInboxError] = useState("");

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<MessageThreadMessagesResponse | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");

  const fetchWithAuth = useCallback(async (input: string, init?: RequestInit) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      throw new Error("Session invalide.");
    }

    return fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }, []);

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    setInboxError("");

    try {
      const response = await fetchWithAuth(
        `/api/parent/children/${studentId}/messages/inbox`,
        {
          method: "GET",
        }
      );
      if (!response.ok) {
        throw new Error(await readApiError(response, "Chargement des conversations impossible."));
      }

      const payload = await response.json();
      const parsed = MessageInboxResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Reponse messagerie invalide.");
      }

      setInbox(parsed.data);
      setSelectedThreadId((current) => {
        if (current && parsed.data.threads.some((thread) => thread.threadId === current)) {
          return current;
        }
        return parsed.data.threads[0]?.threadId ?? null;
      });
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "Erreur messagerie.");
    } finally {
      setInboxLoading(false);
    }
  }, [fetchWithAuth, studentId]);

  const loadThread = useCallback(
    async (threadId: string, cursor?: number) => {
      setThreadLoading(true);
      setThreadError("");

      try {
        const query = new URLSearchParams();
        query.set("limit", "50");
        if (cursor) query.set("cursor", String(cursor));

        const response = await fetchWithAuth(
          `/api/parent/children/${studentId}/messages/threads/${threadId}?${query.toString()}`,
          { method: "GET" }
        );
        if (!response.ok) {
          throw new Error(await readApiError(response, "Chargement des messages impossible."));
        }

        const payload = await response.json();
        const parsed = MessageThreadMessagesResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("Reponse thread invalide.");
        }

        setThreadData((current) => {
          if (!cursor || !current || current.threadId !== parsed.data.threadId) {
            return parsed.data;
          }

          const existingIds = new Set(current.messages.map((message) => message.id));
          const mergedMessages = [
            ...parsed.data.messages.filter((message) => !existingIds.has(message.id)),
            ...current.messages,
          ].sort((first, second) => first.id - second.id);

          return {
            ...parsed.data,
            messages: mergedMessages,
          };
        });
      } catch (error) {
        setThreadError(error instanceof Error ? error.message : "Erreur de chargement.");
      } finally {
        setThreadLoading(false);
      }
    },
    [fetchWithAuth, studentId]
  );

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadData(null);
      return;
    }

    void loadThread(selectedThreadId);
  }, [loadThread, selectedThreadId]);

  const selectedThread = useMemo(
    () => inbox.threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [inbox.threads, selectedThreadId]
  );

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-white/10 bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
              Espace parent
            </p>
            <h1 className="mt-1 text-lg font-semibold text-[var(--text)]">Messages</h1>
          </div>
          <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-amber-200">
            Lecture seule (parent)
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Vous consultez uniquement les conversations coach &lt;-&gt; eleve liees a cet
          enfant.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <MessagesThreadList
          threads={inbox.threads}
          selectedThreadId={selectedThreadId}
          loading={inboxLoading}
          error={inboxError}
          onSelect={(threadId) => setSelectedThreadId(threadId)}
        />

        <div className="space-y-3">
          <section className="rounded-2xl border border-white/10 bg-[var(--panel)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                Nouveau message
              </p>
              <span className="text-xs text-[var(--muted)]">Lecture seule (parent)</span>
            </div>
            <button
              type="button"
              disabled
              title="Lecture seule (parent)"
              className="mt-2 w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-[var(--muted)] opacity-70"
            >
              Envoi des messages indisponible pour les parents
            </button>
          </section>

          <MessagesThreadView
            thread={selectedThread}
            messages={threadData?.messages ?? []}
            threadMembers={threadData?.threadMembers ?? []}
            currentUserId="00000000-0000-0000-0000-000000000000"
            loading={threadLoading}
            error={threadError}
            nextCursor={threadData?.nextCursor ?? null}
            onLoadOlder={async () => {
              if (!selectedThreadId || !threadData?.nextCursor) return;
              await loadThread(selectedThreadId, threadData.nextCursor);
            }}
            counterpartLastReadMessageId={threadData?.counterpartLastReadMessageId ?? null}
            counterpartLastReadAt={threadData?.counterpartLastReadAt ?? null}
            canReport={false}
            reportingMessageId={null}
            onReportMessage={async () => undefined}
            onReportThread={async () => undefined}
          />
        </div>
      </section>
    </section>
  );
}

