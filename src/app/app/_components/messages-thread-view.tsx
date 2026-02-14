"use client";

import type { MessageDto, MessageThreadSummary } from "@/lib/messages/types";

type MessagesThreadViewProps = {
  thread: MessageThreadSummary | null;
  messages: MessageDto[];
  currentUserId: string;
  loading: boolean;
  error: string;
  nextCursor: number | null;
  onLoadOlder: () => Promise<void>;
  counterpartLastReadMessageId: number | null;
  counterpartLastReadAt: string | null;
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatSeenTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatSenderName = (message: MessageDto, currentUserId: string) => {
  const raw = message.senderName?.trim() ?? "";
  if (raw) return raw;
  if (message.senderUserId === currentUserId) return "Vous";
  return "Utilisateur";
};

const toInitials = (value: string) => {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0].slice(0, 1).toUpperCase();
  return `${tokens[0].slice(0, 1)}${tokens[1].slice(0, 1)}`.toUpperCase();
};

const hashToInt = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const resolveGroupSenderPalette = (
  senderUserId: string,
  senderRole: MessageDto["senderRole"],
  isOwn: boolean
) => {
  const hash = hashToInt(senderUserId);
  const isCoachLike = senderRole === "coach" || senderRole === "owner" || senderRole === "staff";
  const hueStart = isCoachLike ? 15 : 190;
  const hueRange = isCoachLike ? 35 : 120;
  const hue = hueStart + (hash % hueRange);
  const saturation = isCoachLike ? 86 : 74;
  const nameLightness = isCoachLike ? 72 : 68;

  return {
    bubbleBackground: `hsla(${hue}, ${saturation}%, 52%, ${isOwn ? 0.28 : 0.14})`,
    bubbleBorder: `hsla(${hue}, ${saturation}%, 60%, 0.46)`,
    nameColor: `hsl(${hue}, ${saturation}%, ${nameLightness}%)`,
    avatarRing: `hsla(${hue}, ${saturation}%, 62%, 0.75)`,
    avatarFallbackBackground: `hsla(${hue}, ${saturation}%, 52%, 0.24)`,
  };
};

const DEFAULT_AVATAR_RING = "var(--border)";
const DEFAULT_AVATAR_FALLBACK_BACKGROUND = "var(--panel-strong)";

export default function MessagesThreadView({
  thread,
  messages,
  currentUserId,
  loading,
  error,
  nextCursor,
  onLoadOlder,
  counterpartLastReadMessageId,
  counterpartLastReadAt,
}: MessagesThreadViewProps) {
  if (!thread) {
    return (
      <section className="flex min-h-[360px] items-center justify-center rounded-2xl bg-[var(--panel)] p-6">
        <p className="text-sm text-[var(--muted)]">Selectionne une conversation.</p>
      </section>
    );
  }

  const latestOutgoingMessageId = [...messages]
    .reverse()
    .find((message) => message.senderUserId === currentUserId)?.id;

  return (
    <section className="flex min-h-[360px] flex-col rounded-2xl bg-[var(--panel)] p-4">
      <header className="border-b border-white/10 pb-3">
        <p className="text-sm font-semibold text-[var(--text)]">
          {thread.kind === "group"
            ? (thread.groupName ?? "Groupe")
            : (thread.counterpartName ?? "Conversation")}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {thread.kind === "student_coach"
            ? "Eleve ↔ Coach"
            : thread.kind === "coach_coach"
              ? "Coach ↔ Coach"
              : "Discussion de groupe"}
        </p>
      </header>

      <div className="mt-4 flex-1 space-y-3 overflow-auto pr-1">
        {nextCursor ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void onLoadOlder()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Charger les messages precedents
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Chargement des messages...</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Aucun message dans cette conversation.</p>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.senderUserId === currentUserId;
            const senderLabel = formatSenderName(message, currentUserId);
            const groupPalette =
              thread.kind === "group"
                ? resolveGroupSenderPalette(
                    message.senderUserId,
                    message.senderRole ?? null,
                    isOwn
                  )
                : null;
            const previousMessage = messages[index - 1] ?? null;
            const showSenderMeta =
              !previousMessage ||
              previousMessage.senderUserId !== message.senderUserId;
            const isSeen =
              isOwn &&
              counterpartLastReadMessageId !== null &&
              counterpartLastReadMessageId >= message.id;
            const showSeenTag =
              thread.kind !== "group" &&
              isSeen &&
              latestOutgoingMessageId !== undefined &&
              message.id === latestOutgoingMessageId;

            return (
              <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`flex max-w-[92%] items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
                >
                  {showSenderMeta ? (
                    message.senderAvatarUrl ? (
                      <span
                        role="img"
                        aria-label={senderLabel}
                        className="h-8 w-8 shrink-0 rounded-full border-2 bg-cover bg-center"
                        style={{
                          backgroundImage: `url("${message.senderAvatarUrl}")`,
                          borderColor: groupPalette?.avatarRing ?? DEFAULT_AVATAR_RING,
                        }}
                      />
                    ) : (
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[0.65rem] font-semibold text-[var(--text)]"
                        style={{
                          borderColor: groupPalette?.avatarRing ?? DEFAULT_AVATAR_RING,
                          backgroundColor:
                            groupPalette?.avatarFallbackBackground ??
                            DEFAULT_AVATAR_FALLBACK_BACKGROUND,
                        }}
                      >
                        {toInitials(senderLabel)}
                      </span>
                    )
                  ) : (
                    <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
                      thread.kind === "group"
                        ? "border text-[var(--text)]"
                        : isOwn
                          ? "bg-emerald-400/20 text-[var(--text)]"
                          : "border border-white/10 bg-white/5 text-[var(--text)]"
                    }`}
                    style={
                      groupPalette
                        ? {
                            backgroundColor: groupPalette.bubbleBackground,
                            borderColor: groupPalette.bubbleBorder,
                          }
                        : undefined
                    }
                  >
                    {showSenderMeta ? (
                      <p
                        className="text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
                        style={{ color: groupPalette?.nameColor ?? "var(--muted)" }}
                      >
                        {senderLabel}
                      </p>
                    ) : null}
                    <p className={`${showSenderMeta ? "mt-1 " : ""}whitespace-pre-wrap break-words`}>
                      {message.body}
                    </p>
                    <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                      {formatMessageTime(message.createdAt)}
                    </p>
                    {showSeenTag ? (
                      <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-emerald-200">
                        Vu a {formatSeenTime(counterpartLastReadAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
