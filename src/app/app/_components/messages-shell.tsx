"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MessagesCompose from "@/app/app/_components/messages-compose";
import MessagesContactsModal from "@/app/app/_components/messages-contacts-modal";
import MessagesThreadList from "@/app/app/_components/messages-thread-list";
import MessagesThreadView from "@/app/app/_components/messages-thread-view";
import { useProfile } from "@/app/app/_components/profile-context";
import { dispatchMessagesNotificationsSync } from "@/lib/messages/client-events";
import {
  CreateMessageThreadSchema,
  MessageContactsResponseSchema,
  MessageDtoSchema,
  MessageInboxResponseSchema,
  MessageThreadMessagesResponseSchema,
  type MessageContactsResponse,
  type MessageDto,
  type MessageInboxResponse,
  type MessageThreadMessagesResponse,
} from "@/lib/messages/types";
import { supabase } from "@/lib/supabase/client";

type MessagesShellProps = {
  roleScope: "coach" | "student";
};

const POLL_INTERVAL_MS = 30_000;

const readApiError = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? fallback;
};

export default function MessagesShell({ roleScope }: MessagesShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading: profileLoading } = useProfile();

  const [inbox, setInbox] = useState<MessageInboxResponse>({
    threads: [],
    unreadMessagesCount: 0,
  });
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxError, setInboxError] = useState("");
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<MessageThreadMessagesResponse | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");

  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");

  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState("");
  const [contactsData, setContactsData] = useState<MessageContactsResponse | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);

  const preferredThreadId = searchParams.get("threadId");

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

  const loadInbox = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setInboxLoading(true);
      }
      setInboxError("");

      try {
        const response = await fetchWithAuth("/api/messages/inbox", { method: "GET" });
        if (!response.ok) {
          throw new Error(await readApiError(response, "Chargement des conversations impossible."));
        }

        const payload = await response.json();
        const parsed = MessageInboxResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("Reponse messagerie invalide.");
        }

        setInbox(parsed.data);
        dispatchMessagesNotificationsSync({
          unreadMessagesCount: parsed.data.unreadMessagesCount,
          refetch: false,
        });
        setSelectedThreadId((currentThreadId) => {
          const availableIds = new Set(parsed.data.threads.map((thread) => thread.threadId));
          if (currentThreadId && availableIds.has(currentThreadId)) {
            return currentThreadId;
          }
          if (preferredThreadId && availableIds.has(preferredThreadId)) {
            return preferredThreadId;
          }
          return parsed.data.threads[0]?.threadId ?? null;
        });
      } catch (error) {
        setInboxError(error instanceof Error ? error.message : "Erreur messagerie.");
      } finally {
        setInboxLoading(false);
      }
    },
    [fetchWithAuth, preferredThreadId]
  );

  const markThreadRead = useCallback(
    async (threadId: string, lastReadMessageId: number) => {
      const response = await fetchWithAuth(`/api/messages/threads/${threadId}/read`, {
        method: "POST",
        body: JSON.stringify({ lastReadMessageId }),
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        lastReadMessageId?: number;
        lastReadAt?: string;
      };

      if (!payload.lastReadMessageId) return;

      setThreadData((current) => {
        if (!current || current.threadId !== threadId) return current;
        return {
          ...current,
          ownLastReadMessageId: payload.lastReadMessageId ?? current.ownLastReadMessageId,
          ownLastReadAt: payload.lastReadAt ?? current.ownLastReadAt,
        };
      });

      setInbox((current) => ({
        ...current,
        threads: current.threads.map((thread) =>
          thread.threadId === threadId
            ? {
                ...thread,
                ownLastReadMessageId: payload.lastReadMessageId ?? thread.ownLastReadMessageId,
                ownLastReadAt: payload.lastReadAt ?? thread.ownLastReadAt,
                unread: false,
                unreadCount: 0,
          }
            : thread
        ),
      }));

      void loadInbox({ silent: true });
    },
    [fetchWithAuth, loadInbox]
  );

  const loadThread = useCallback(
    async (
      threadId: string,
      options?: {
        cursor?: number;
        appendOlder?: boolean;
        silent?: boolean;
      }
    ) => {
      const cursor = options?.cursor ?? null;
      const appendOlder = options?.appendOlder ?? false;
      const silent = options?.silent ?? false;

      if (!silent) {
        setThreadLoading(true);
      }
      setThreadError("");

      try {
        const query = new URLSearchParams();
        query.set("limit", "50");
        if (cursor) {
          query.set("cursor", String(cursor));
        }

        const response = await fetchWithAuth(
          `/api/messages/threads/${threadId}/messages?${query.toString()}`,
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
          if (!appendOlder || !current || current.threadId !== threadId) {
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

        if (profile?.id) {
          const latestIncomingMessage = [...parsed.data.messages]
            .reverse()
            .find((message) => message.senderUserId !== profile.id);

          if (
            latestIncomingMessage &&
            (!parsed.data.ownLastReadMessageId ||
              latestIncomingMessage.id > parsed.data.ownLastReadMessageId)
          ) {
            void markThreadRead(threadId, latestIncomingMessage.id);
          }
        }
      } catch (error) {
        setThreadError(error instanceof Error ? error.message : "Erreur de chargement.");
      } finally {
        setThreadLoading(false);
      }
    },
    [fetchWithAuth, markThreadRead, profile?.id]
  );

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError("");

    try {
      const response = await fetchWithAuth("/api/messages/contacts", { method: "GET" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Chargement des contacts impossible."));
      }

      const payload = await response.json();
      const parsed = MessageContactsResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Reponse contacts invalide.");
      }

      setContactsData(parsed.data);
    } catch (error) {
      setContactsError(error instanceof Error ? error.message : "Erreur contacts.");
    } finally {
      setContactsLoading(false);
    }
  }, [fetchWithAuth]);

  const openContacts = async () => {
    setContactsOpen(true);
    await loadContacts();
  };

  const startThread = useCallback(
    async (payload: unknown, key: string) => {
      setSubmittingKey(key);
      setContactsError("");
      try {
        const parsedPayload = CreateMessageThreadSchema.safeParse(payload);
        if (!parsedPayload.success) {
          throw new Error("Payload thread invalide.");
        }

        const response = await fetchWithAuth("/api/messages/threads", {
          method: "POST",
          body: JSON.stringify(parsedPayload.data),
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, "Creation conversation impossible."));
        }

        const responseBody = (await response.json()) as { threadId?: string };
        if (!responseBody.threadId) {
          throw new Error("Thread introuvable dans la reponse.");
        }

        setSelectedThreadId(responseBody.threadId);
        setContactsOpen(false);
        await loadInbox({ silent: true });
        await loadThread(responseBody.threadId, { silent: true });

        const params = new URLSearchParams(searchParams.toString());
        params.set("threadId", responseBody.threadId);
        router.replace(`?${params.toString()}`);
      } catch (error) {
        setContactsError(
          error instanceof Error ? error.message : "Creation conversation impossible."
        );
      } finally {
        setSubmittingKey(null);
      }
    },
    [fetchWithAuth, loadInbox, loadThread, router, searchParams]
  );

  const handleStartStudentThread = async (studentId: string, coachId: string) => {
    await startThread({ kind: "student_coach", studentId, coachId }, `student:${studentId}:${coachId}`);
  };

  const handleStartCoachThread = async (coachUserId: string) => {
    await startThread({ kind: "coach_coach", coachUserId }, `coach:${coachUserId}`);
  };

  const handleStartGroupThread = async (groupId: string) => {
    await startThread({ kind: "group", groupId }, `group:${groupId}`);
  };

  const handleRequestCoachContact = async (targetEmail: string) => {
    const response = await fetchWithAuth("/api/messages/coach-contacts/request", {
      method: "POST",
      body: JSON.stringify({ targetEmail }),
    });

    if (!response.ok) {
      throw new Error(await readApiError(response, "Demande contact impossible."));
    }

    await loadContacts();
  };

  const handleRespondCoachRequest = async (
    requestId: string,
    decision: "accept" | "reject"
  ) => {
    setActionRequestId(requestId);
    setContactsError("");
    try {
      const response = await fetchWithAuth("/api/messages/coach-contacts/respond", {
        method: "POST",
        body: JSON.stringify({ requestId, decision }),
      });

      if (!response.ok) {
        setContactsError(await readApiError(response, "Decision impossible."));
        return;
      }

      await loadContacts();
    } finally {
      setActionRequestId(null);
    }
  };

  const handleSendMessage = useCallback(
    async (body: string) => {
      if (!selectedThreadId || !profile?.id) return;

      const optimisticId = Date.now() + 10_000_000;
      const optimisticMessage: MessageDto = {
        id: optimisticId,
        threadId: selectedThreadId,
        senderUserId: profile.id,
        senderName: profile.full_name ?? null,
        senderAvatarUrl: profile.avatar_url ?? null,
        senderRole: profile.role,
        body,
        createdAt: new Date().toISOString(),
      };

      setComposeError("");
      setSending(true);
      setThreadData((current) => {
        if (!current || current.threadId !== selectedThreadId) return current;
        return {
          ...current,
          messages: [...current.messages, optimisticMessage],
        };
      });

      try {
        const response = await fetchWithAuth(`/api/messages/threads/${selectedThreadId}/messages`, {
          method: "POST",
          body: JSON.stringify({ body }),
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, "Envoi impossible."));
        }

        const payload = (await response.json()) as { message?: unknown };
        const parsedMessage = MessageDtoSchema.safeParse(payload.message);
        if (!parsedMessage.success) {
          throw new Error("Message invalide dans la reponse.");
        }

        setThreadData((current) => {
          if (!current || current.threadId !== selectedThreadId) return current;
          return {
            ...current,
            messages: current.messages
              .filter((message) => message.id !== optimisticId)
              .concat(parsedMessage.data)
              .sort((first, second) => first.id - second.id),
          };
        });

        await loadInbox({ silent: true });
      } catch (error) {
        setThreadData((current) => {
          if (!current || current.threadId !== selectedThreadId) return current;
          return {
            ...current,
            messages: current.messages.filter((message) => message.id !== optimisticId),
          };
        });

        setComposeError(error instanceof Error ? error.message : "Envoi impossible.");
        throw error;
      } finally {
        setSending(false);
      }
    },
    [
      fetchWithAuth,
      loadInbox,
      profile?.avatar_url,
      profile?.full_name,
      profile?.id,
      profile?.role,
      selectedThreadId,
    ]
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      if (!threadId) return;
      const confirmed = window.confirm(
        "Supprimer cette conversation de votre liste ?"
      );
      if (!confirmed) return;

      setDeletingThreadId(threadId);
      setInboxError("");

      try {
        const response = await fetchWithAuth(`/api/messages/threads/${threadId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(
            await readApiError(response, "Suppression conversation impossible.")
          );
        }

        setThreadData((current) =>
          current && current.threadId === threadId ? null : current
        );
        setSelectedThreadId((current) => (current === threadId ? null : current));

        const params = new URLSearchParams(searchParams.toString());
        if (params.get("threadId") === threadId) {
          params.delete("threadId");
          router.replace(params.toString() ? `?${params.toString()}` : "?");
        }

        await loadInbox({ silent: true });
      } catch (error) {
        setInboxError(
          error instanceof Error ? error.message : "Suppression conversation impossible."
        );
      } finally {
        setDeletingThreadId(null);
      }
    },
    [fetchWithAuth, loadInbox, router, searchParams]
  );

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) return;

    void loadInbox();
  }, [loadInbox, profile, profileLoading]);

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadData(null);
      return;
    }

    void loadThread(selectedThreadId);
  }, [loadThread, selectedThreadId]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`messages-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_messages" }, (payload) => {
        const row = payload.new as { thread_id?: string };
        void loadInbox({ silent: true });
        if (selectedThreadId && row.thread_id === selectedThreadId) {
          void loadThread(selectedThreadId, { silent: true });
        }
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_thread_members" },
        (payload) => {
          const row = payload.new as { thread_id?: string };
          if (selectedThreadId && row.thread_id === selectedThreadId) {
            void loadThread(selectedThreadId, { silent: true });
          }
          void loadInbox({ silent: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadInbox, loadThread, profile?.id, selectedThreadId]);

  useEffect(() => {
    if (!profile?.id) return;

    const interval = window.setInterval(() => {
      void loadInbox({ silent: true });
      if (selectedThreadId) {
        void loadThread(selectedThreadId, { silent: true });
      }
    }, POLL_INTERVAL_MS);

    const handleFocus = () => {
      void loadInbox({ silent: true });
      if (selectedThreadId) {
        void loadThread(selectedThreadId, { silent: true });
      }
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadInbox, loadThread, profile?.id, selectedThreadId]);

  const selectedThread = useMemo(
    () => inbox.threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [inbox.threads, selectedThreadId]
  );

  const messages = threadData?.messages ?? [];
  const nextCursor = threadData?.nextCursor ?? null;

  if (profileLoading) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Chargement de la messagerie...</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Session introuvable.</p>
      </section>
    );
  }

  if (roleScope === "student" && profile.role !== "student") {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Acces reserve aux eleves.</p>
      </section>
    );
  }

  if (roleScope === "coach" && profile.role === "student") {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Acces reserve aux coachs.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Messagerie interne</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--text)]">Messages</h1>
        </div>
        <button
          type="button"
          onClick={() => void openContacts()}
          className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90"
        >
          Nouvelle conversation
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <MessagesThreadList
          threads={inbox.threads}
          selectedThreadId={selectedThreadId}
          loading={inboxLoading}
          error={inboxError}
          deletingThreadId={deletingThreadId}
          onSelect={(threadId) => {
            setSelectedThreadId(threadId);
            const params = new URLSearchParams(searchParams.toString());
            params.set("threadId", threadId);
            router.replace(`?${params.toString()}`);
          }}
          onDelete={handleDeleteThread}
        />

        <div className="space-y-3">
          <MessagesThreadView
            thread={selectedThread}
            messages={messages}
            currentUserId={profile.id}
            loading={threadLoading}
            error={threadError}
            nextCursor={nextCursor}
            onLoadOlder={async () => {
              if (!selectedThreadId || !nextCursor) return;
              await loadThread(selectedThreadId, {
                cursor: nextCursor,
                appendOlder: true,
                silent: true,
              });
            }}
            counterpartLastReadMessageId={
              threadData?.counterpartLastReadMessageId ?? selectedThread?.counterpartLastReadMessageId ?? null
            }
            counterpartLastReadAt={
              threadData?.counterpartLastReadAt ?? selectedThread?.counterpartLastReadAt ?? null
            }
          />
          {composeError ? <p className="text-sm text-red-400">{composeError}</p> : null}
          <MessagesCompose
            disabled={!selectedThread}
            sending={sending}
            onSend={handleSendMessage}
          />
        </div>
      </div>

      <MessagesContactsModal
        open={contactsOpen}
        loading={contactsLoading}
        error={contactsError}
        canRequestCoachContact={profile.role !== "student"}
        data={contactsData}
        submittingKey={submittingKey}
        actionRequestId={actionRequestId}
        onClose={() => setContactsOpen(false)}
        onReload={loadContacts}
        onStartStudentThread={handleStartStudentThread}
        onStartCoachThread={handleStartCoachThread}
        onStartGroupThread={handleStartGroupThread}
        onRequestCoachContact={handleRequestCoachContact}
        onRespondCoachRequest={handleRespondCoachRequest}
      />
    </div>
  );
}
