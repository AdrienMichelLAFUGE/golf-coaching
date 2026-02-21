"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import MessagesCompose from "@/app/app/_components/messages-compose";
import MessagesContactsModal from "@/app/app/_components/messages-contacts-modal";
import MessagesModerationModal from "@/app/app/_components/messages-moderation-modal";
import MessagesThreadList from "@/app/app/_components/messages-thread-list";
import MessagesThreadView from "@/app/app/_components/messages-thread-view";
import { useProfile } from "@/app/app/_components/profile-context";
import { dispatchMessagesNotificationsSync } from "@/lib/messages/client-events";
import {
  appendRealtimeMessage,
  mergeServerMessageWithOptimistic,
} from "@/lib/messages/thread-updates";
import {
  CreateMessageThreadSchema,
  MessagingCharterStatusSchema,
  MessageContactsResponseSchema,
  MessageDtoSchema,
  MessageInboxResponseSchema,
  MessageReportThreadMessagesResponseSchema,
  MessageReportsResponseSchema,
  MessageThreadMessagesResponseSchema,
  type MessageContactsResponse,
  type MessageDto,
  type MessageInboxResponse,
  type MessageReportDto,
  type MessageReportThreadMessagesResponse,
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
  const {
    profile,
    organization,
    isWorkspaceAdmin,
    loading: profileLoading,
  } = useProfile();

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
  const [reportError, setReportError] = useState("");
  const [reportingMessageId, setReportingMessageId] = useState<number | null>(null);

  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState("");
  const [contactsData, setContactsData] = useState<MessageContactsResponse | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);
  const handledAutoOpenKeyRef = useRef<string | null>(null);
  const handledModerationAutoOpenKeyRef = useRef<string | null>(null);

  const [charterMustAccept, setCharterMustAccept] = useState<boolean | null>(null);
  const [charterVersion, setCharterVersion] = useState<number | null>(null);
  const [charterText, setCharterText] = useState<{
    title: string;
    body: string;
    orgNamePlaceholder: string;
    supportEmailPlaceholder: string;
  } | null>(null);
  const [charterLoading, setCharterLoading] = useState(false);
  const [charterError, setCharterError] = useState("");
  const [acceptingCharter, setAcceptingCharter] = useState(false);

  const [moderationOpen, setModerationOpen] = useState(false);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationError, setModerationError] = useState("");
  const [moderationReports, setModerationReports] = useState<MessageReportDto[]>([]);
  const [moderationActionReportId, setModerationActionReportId] = useState<string | null>(null);
  const [moderationSelectedReportId, setModerationSelectedReportId] = useState<string | null>(
    null
  );
  const [moderationContextLoading, setModerationContextLoading] = useState(false);
  const [moderationContextError, setModerationContextError] = useState("");
  const [moderationContextData, setModerationContextData] =
    useState<MessageReportThreadMessagesResponse | null>(null);

  const preferredThreadId = searchParams.get("threadId");
  const openContactsParam = searchParams.get("contacts");
  const highlightedRequestId = searchParams.get("requestId");
  const moderationParam = searchParams.get("moderation");

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

  const handleCharterBlockedResponse = useCallback(async (response: Response) => {
    if (response.status !== 428) return false;

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      charterVersion?: number;
    };

    if (typeof payload.charterVersion === "number") {
      setCharterVersion(payload.charterVersion);
    }
    setCharterMustAccept(true);
    setCharterError(payload.error ?? "Acceptation de la charte messagerie requise.");
    return true;
  }, []);

  const loadCharterStatus = useCallback(async () => {
    if (!profile) return;

    setCharterLoading(true);
    setCharterError("");
    try {
      const response = await fetchWithAuth("/api/messages/charter", { method: "GET" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Chargement charte messagerie impossible."));
      }

      const payload = await response.json();
      const parsed = MessagingCharterStatusSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Reponse charte messagerie invalide.");
      }

      setCharterMustAccept(parsed.data.mustAccept);
      setCharterVersion(parsed.data.charterVersion);
      setCharterText(parsed.data.content);
    } catch (error) {
      setCharterMustAccept(false);
      setCharterError(error instanceof Error ? error.message : "Erreur charte messagerie.");
    } finally {
      setCharterLoading(false);
    }
  }, [fetchWithAuth, profile]);

  const loadInbox = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setInboxLoading(true);
      }
      setInboxError("");

      try {
        const response = await fetchWithAuth("/api/messages/inbox", { method: "GET" });
        if (!response.ok) {
          if (await handleCharterBlockedResponse(response)) {
            return;
          }
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
    [fetchWithAuth, handleCharterBlockedResponse, preferredThreadId]
  );

  const markThreadRead = useCallback(
    async (threadId: string, lastReadMessageId: number) => {
      const response = await fetchWithAuth(`/api/messages/threads/${threadId}/read`, {
        method: "POST",
        body: JSON.stringify({ lastReadMessageId }),
      });

      if (await handleCharterBlockedResponse(response)) {
        return;
      }
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
    [fetchWithAuth, handleCharterBlockedResponse, loadInbox]
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
          if (await handleCharterBlockedResponse(response)) {
            return;
          }
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
    [fetchWithAuth, handleCharterBlockedResponse, markThreadRead, profile?.id]
  );

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError("");

    try {
      const response = await fetchWithAuth("/api/messages/contacts", { method: "GET" });
      if (!response.ok) {
        if (await handleCharterBlockedResponse(response)) {
          return;
        }
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
  }, [fetchWithAuth, handleCharterBlockedResponse]);

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
          if (await handleCharterBlockedResponse(response)) {
            return;
          }
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
        params.delete("contacts");
        params.delete("requestId");
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
    [
      fetchWithAuth,
      handleCharterBlockedResponse,
      loadInbox,
      loadThread,
      router,
      searchParams,
    ]
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

  const handleStartGroupInfoThread = async (groupId: string) => {
    await startThread({ kind: "group_info", groupId }, `group_info:${groupId}`);
  };

  const handleStartOrgInfoThread = async () => {
    await startThread({ kind: "org_info" }, "org_info");
  };

  const handleStartOrgCoachesThread = async () => {
    await startThread({ kind: "org_coaches" }, "org_coaches");
  };

  const handleRequestCoachContact = async (targetEmail: string) => {
    const response = await fetchWithAuth("/api/messages/coach-contacts/request", {
      method: "POST",
      body: JSON.stringify({ targetEmail }),
    });

    if (!response.ok) {
      if (await handleCharterBlockedResponse(response)) {
        return;
      }
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
        if (await handleCharterBlockedResponse(response)) {
          return;
        }
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
          if (await handleCharterBlockedResponse(response)) {
            throw new Error("Acceptation de la charte messagerie requise.");
          }
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
            messages: mergeServerMessageWithOptimistic(
              current.messages,
              optimisticId,
              parsedMessage.data
            ),
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
      handleCharterBlockedResponse,
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
          if (await handleCharterBlockedResponse(response)) {
            return;
          }
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
    [fetchWithAuth, handleCharterBlockedResponse, loadInbox, router, searchParams]
  );

  const handleAcceptCharter = useCallback(async () => {
    if (charterVersion === null) return;

    setAcceptingCharter(true);
    setCharterError("");
    try {
      const response = await fetchWithAuth("/api/messages/charter", {
        method: "POST",
        body: JSON.stringify({ charterVersion }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Acceptation charte impossible."));
      }

      setCharterMustAccept(false);
      await loadInbox();
    } catch (error) {
      setCharterError(
        error instanceof Error ? error.message : "Acceptation charte impossible."
      );
    } finally {
      setAcceptingCharter(false);
    }
  }, [charterVersion, fetchWithAuth, loadInbox]);

  const submitReport = useCallback(
    async (messageId: number | null) => {
      if (!selectedThreadId) return;

      const reasonRaw = window.prompt(
        "Motif du signalement (ex: propos inappropries, pression, harcelement):"
      );
      const reason = reasonRaw?.trim() ?? "";
      if (!reason) return;

      const detailsRaw = window.prompt("Details (optionnel):");
      const details = detailsRaw?.trim() ?? "";

      setReportError("");
      setReportingMessageId(messageId);

      try {
        const response = await fetchWithAuth("/api/messages/reports", {
          method: "POST",
          body: JSON.stringify({
            threadId: selectedThreadId,
            ...(messageId ? { messageId } : {}),
            reason,
            ...(details ? { details } : {}),
          }),
        });

        if (!response.ok) {
          if (await handleCharterBlockedResponse(response)) {
            return;
          }
          throw new Error(await readApiError(response, "Signalement impossible."));
        }

        window.alert("Signalement envoye a la structure.");

        if (moderationOpen) {
          const reportsResponse = await fetchWithAuth("/api/messages/reports", {
            method: "GET",
          });
          if (reportsResponse.ok) {
            const payload = await reportsResponse.json();
            const parsed = MessageReportsResponseSchema.safeParse(payload);
            if (parsed.success) {
              setModerationReports(parsed.data.reports);
            }
          }
        }
      } catch (error) {
        setReportError(error instanceof Error ? error.message : "Signalement impossible.");
      } finally {
        setReportingMessageId(null);
      }
    },
    [
      fetchWithAuth,
      handleCharterBlockedResponse,
      moderationOpen,
      selectedThreadId,
    ]
  );

  const loadModerationReports = useCallback(async () => {
    setModerationLoading(true);
    setModerationError("");

    try {
      const response = await fetchWithAuth("/api/messages/reports", { method: "GET" });
      if (!response.ok) {
        if (await handleCharterBlockedResponse(response)) {
          return;
        }
        throw new Error(await readApiError(response, "Chargement signalements impossible."));
      }

      const payload = await response.json();
      const parsed = MessageReportsResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Reponse signalements invalide.");
      }

      setModerationReports(parsed.data.reports);
    } catch (error) {
      setModerationError(
        error instanceof Error ? error.message : "Chargement signalements impossible."
      );
    } finally {
      setModerationLoading(false);
    }
  }, [fetchWithAuth, handleCharterBlockedResponse]);

  const loadModerationReportContext = useCallback(
    async (reportId: string) => {
      setModerationSelectedReportId(reportId);
      setModerationContextLoading(true);
      setModerationContextError("");
      setModerationContextData(null);

      try {
        const response = await fetchWithAuth(`/api/messages/reports/${reportId}/messages?limit=120`, {
          method: "GET",
        });
        if (!response.ok) {
          if (await handleCharterBlockedResponse(response)) {
            return;
          }
          throw new Error(await readApiError(response, "Chargement contexte impossible."));
        }

        const payload = await response.json();
        const parsed = MessageReportThreadMessagesResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("Reponse contexte signalement invalide.");
        }
        setModerationContextData(parsed.data);
      } catch (error) {
        setModerationContextError(
          error instanceof Error ? error.message : "Chargement contexte impossible."
        );
      } finally {
        setModerationContextLoading(false);
      }
    },
    [fetchWithAuth, handleCharterBlockedResponse]
  );

  const updateModerationReportStatus = useCallback(
    async (
      reportId: string,
      status: "open" | "in_review" | "resolved",
      freezeThread: boolean
    ) => {
      setModerationActionReportId(reportId);
      setModerationError("");

      try {
        const response = await fetchWithAuth(`/api/messages/reports/${reportId}/status`, {
          method: "POST",
          body: JSON.stringify({ status, freezeThread }),
        });

        if (!response.ok) {
          if (await handleCharterBlockedResponse(response)) {
            return;
          }
          throw new Error(await readApiError(response, "Mise a jour signalement impossible."));
        }

        await loadModerationReports();
        if (moderationSelectedReportId === reportId) {
          await loadModerationReportContext(reportId);
        }
      } catch (error) {
        setModerationError(
          error instanceof Error ? error.message : "Mise a jour signalement impossible."
        );
      } finally {
        setModerationActionReportId(null);
      }
    },
    [
      fetchWithAuth,
      handleCharterBlockedResponse,
      loadModerationReportContext,
      loadModerationReports,
      moderationSelectedReportId,
    ]
  );

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) return;

    void loadCharterStatus();
  }, [loadCharterStatus, profile, profileLoading]);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) return;
    if (charterMustAccept === null) return;
    if (charterMustAccept) {
      setInboxLoading(false);
      return;
    }

    void loadInbox();
  }, [charterMustAccept, loadInbox, profile, profileLoading]);

  useEffect(() => {
    if (charterMustAccept) return;
    if (!selectedThreadId) {
      setThreadData(null);
      return;
    }

    void loadThread(selectedThreadId);
  }, [charterMustAccept, loadThread, selectedThreadId]);

  useEffect(() => {
    if (roleScope !== "coach") return;
    if (openContactsParam !== "open" && !highlightedRequestId) {
      handledAutoOpenKeyRef.current = null;
      return;
    }

    const nextAutoOpenKey = `${openContactsParam ?? ""}:${highlightedRequestId ?? ""}`;
    if (handledAutoOpenKeyRef.current === nextAutoOpenKey) return;
    handledAutoOpenKeyRef.current = nextAutoOpenKey;

    setContactsOpen(true);
    void loadContacts();
  }, [
    highlightedRequestId,
    loadContacts,
    openContactsParam,
    roleScope,
  ]);

  useEffect(() => {
    if (moderationParam !== "open") {
      handledModerationAutoOpenKeyRef.current = null;
      return;
    }
    if (!isWorkspaceAdmin || profile?.role === "student") return;
    if (handledModerationAutoOpenKeyRef.current === moderationParam) return;
    handledModerationAutoOpenKeyRef.current = moderationParam;

    setModerationOpen(true);
    void loadModerationReports();
  }, [isWorkspaceAdmin, loadModerationReports, moderationParam, profile?.role]);

  useEffect(() => {
    if (charterMustAccept) return;
    if (!profile?.id) return;

    const channel = supabase
      .channel(`messages-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_messages" }, (payload) => {
        const row = payload.new as {
          id?: number | string;
          thread_id?: string;
          sender_user_id?: string;
          body?: string;
          created_at?: string;
        };
        const realtimeMessageIdRaw = row.id;
        const realtimeMessageId =
          typeof realtimeMessageIdRaw === "number"
            ? realtimeMessageIdRaw
            : Number(realtimeMessageIdRaw);
        void loadInbox({ silent: true });
        if (selectedThreadId && row.thread_id === selectedThreadId && Number.isFinite(realtimeMessageId) && realtimeMessageId > 0) {
          setThreadData((current) => {
            if (!current || current.threadId !== selectedThreadId) return current;
            if (current.messages.some((message) => message.id === realtimeMessageId)) {
              return current;
            }

            const senderMember = current.threadMembers.find(
              (member) => member.userId === row.sender_user_id
            );

            const realtimeMessage: MessageDto = {
              id: realtimeMessageId,
              threadId: selectedThreadId,
              senderUserId: row.sender_user_id ?? "",
              senderName: senderMember?.fullName ?? null,
              senderAvatarUrl: senderMember?.avatarUrl ?? null,
              senderRole: senderMember?.role ?? null,
              body: row.body ?? "",
              createdAt: row.created_at ?? new Date().toISOString(),
            };

            if (!realtimeMessage.senderUserId || !realtimeMessage.body.trim()) {
              void loadThread(selectedThreadId, { silent: true });
              return current;
            }

            return {
              ...current,
              messages: appendRealtimeMessage(current.messages, realtimeMessage),
            };
          });

          if (row.sender_user_id && row.sender_user_id !== profile.id) {
            void markThreadRead(selectedThreadId, realtimeMessageId);
          }
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
  }, [
    charterMustAccept,
    loadInbox,
    loadThread,
    markThreadRead,
    profile?.id,
    selectedThreadId,
  ]);

  useEffect(() => {
    if (charterMustAccept) return;
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
  }, [charterMustAccept, loadInbox, loadThread, profile?.id, selectedThreadId]);

  const selectedThread = useMemo(
    () => inbox.threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [inbox.threads, selectedThreadId]
  );

  const isReadOnlyThreadForCurrentUser =
    selectedThread !== null &&
    profile !== null &&
    profile.role === "student" &&
    (selectedThread.kind === "group_info" || selectedThread.kind === "org_info");
  const isFrozenThread = Boolean(selectedThread?.frozenAt);
  const charterOrgName =
    organization?.workspace_type === "org"
      ? (organization.name ?? "votre organisation")
      : "SwingFlow";
  const charterSupportEmail = "contact@swingflow.fr";
  const complianceReturnTo = useMemo(() => {
    const basePath = roleScope === "coach" ? "/app/coach/messages" : "/app/eleve/messages";
    const params = searchParams.toString();
    return params ? `${basePath}?${params}` : basePath;
  }, [roleScope, searchParams]);

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
        <div className="flex flex-wrap items-center gap-2">
          {isWorkspaceAdmin && organization?.workspace_type === "org" ? (
            <button
              type="button"
              onClick={() => {
                setModerationOpen(true);
                void loadModerationReports();
              }}
              className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:border-amber-300/50"
            >
              Signalements
            </button>
          ) : null}
          <button
            type="button"
            disabled={charterMustAccept === true}
            onClick={() => void openContacts()}
            className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Nouvelle conversation
          </button>
        </div>
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
            params.delete("contacts");
            params.delete("requestId");
            params.set("threadId", threadId);
            router.replace(`?${params.toString()}`);
          }}
          onDelete={handleDeleteThread}
        />

        <div className="space-y-3">
          <MessagesThreadView
            thread={selectedThread}
            messages={messages}
            threadMembers={threadData?.threadMembers ?? []}
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
            canReport={Boolean(selectedThread)}
            reportingMessageId={reportingMessageId}
            onReportMessage={async (messageId) => {
              await submitReport(messageId);
            }}
            onReportThread={async () => {
              await submitReport(null);
            }}
          />
          {composeError ? <p className="text-sm text-red-400">{composeError}</p> : null}
          {reportError ? <p className="text-sm text-red-400">{reportError}</p> : null}
          <MessagesCompose
            disabled={!selectedThread || isReadOnlyThreadForCurrentUser || isFrozenThread}
            sending={sending}
            onSend={handleSendMessage}
          />
          {isReadOnlyThreadForCurrentUser ? (
            <p className="text-xs text-[var(--muted)]">
              Canal informationnel: lecture seule pour les eleves.
            </p>
          ) : null}
          {isFrozenThread ? (
            <p className="text-xs text-[var(--muted)]">
              Conversation gelee par la structure: envoi temporairement desactive.
            </p>
          ) : null}
        </div>
      </div>

      <MessagesContactsModal
        open={contactsOpen}
        loading={contactsLoading}
        error={contactsError}
        canRequestCoachContact={profile.role !== "student"}
        highlightRequestId={highlightedRequestId}
        canCreateInformationalThreads={
          profile.role !== "student" && organization?.workspace_type === "org"
        }
        organizationName={organization?.name ?? null}
        data={contactsData}
        submittingKey={submittingKey}
        actionRequestId={actionRequestId}
        onClose={() => setContactsOpen(false)}
        onReload={loadContacts}
        onStartStudentThread={handleStartStudentThread}
        onStartCoachThread={handleStartCoachThread}
        onStartGroupThread={handleStartGroupThread}
        onStartGroupInfoThread={handleStartGroupInfoThread}
        onStartOrgInfoThread={handleStartOrgInfoThread}
        onStartOrgCoachesThread={handleStartOrgCoachesThread}
        onRequestCoachContact={handleRequestCoachContact}
        onRespondCoachRequest={handleRespondCoachRequest}
      />

      <MessagesModerationModal
        open={moderationOpen}
        loading={moderationLoading}
        error={moderationError}
        reports={moderationReports}
        actionReportId={moderationActionReportId}
        selectedReportId={moderationSelectedReportId}
        contextLoading={moderationContextLoading}
        contextError={moderationContextError}
        contextData={moderationContextData}
        onClose={() => setModerationOpen(false)}
        onReload={loadModerationReports}
        onViewReport={loadModerationReportContext}
        onUpdateReportStatus={updateModerationReportStatus}
      />

      {charterMustAccept ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
          <section className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
              Conformite messagerie
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--text)]">
              {charterText?.title ?? "Charte messagerie"}
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm text-[var(--muted)]">
              {(charterText?.body ?? "")
                .replace(
                  charterText?.orgNamePlaceholder ?? "{ORG_NAME}",
                  charterOrgName
                )
                .replace(
                  charterText?.supportEmailPlaceholder ?? "{DPO_OR_SUPPORT_EMAIL}",
                  charterSupportEmail
                )}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Voir les textes juridiques:{" "}
              <Link
                href={`/conformite-messagerie?returnTo=${encodeURIComponent(complianceReturnTo)}`}
                target="_blank"
                className="underline underline-offset-4"
              >
                notice RGPD / charte / addendum CGU
              </Link>
              .
            </p>
            {charterError ? <p className="mt-3 text-sm text-red-400">{charterError}</p> : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={acceptingCharter || charterLoading}
                onClick={() => void handleAcceptCharter()}
                className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 disabled:opacity-70"
              >
                {acceptingCharter ? "Validation..." : "J accepte la charte"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
