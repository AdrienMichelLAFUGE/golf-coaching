export const MESSAGES_NOTIFICATIONS_SYNC_EVENT = "gc:messages-notifications-sync";

export type MessageNotificationsSyncDetail = {
  unreadMessagesCount?: number;
  refetch?: boolean;
};

export const dispatchMessagesNotificationsSync = (
  detail: MessageNotificationsSyncDetail = {}
) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<MessageNotificationsSyncDetail>(
      MESSAGES_NOTIFICATIONS_SYNC_EVENT,
      { detail }
    )
  );
};
