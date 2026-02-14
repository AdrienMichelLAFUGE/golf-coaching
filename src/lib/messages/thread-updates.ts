import type { MessageDto } from "@/lib/messages/types";

const sortMessagesById = (messages: MessageDto[]) =>
  [...messages].sort((first, second) => first.id - second.id);

export const mergeServerMessageWithOptimistic = (
  messages: MessageDto[],
  optimisticId: number,
  serverMessage: MessageDto
) =>
  sortMessagesById(
    messages
      .filter((message) => message.id !== optimisticId && message.id !== serverMessage.id)
      .concat(serverMessage)
  );

export const appendRealtimeMessage = (
  messages: MessageDto[],
  realtimeMessage: MessageDto
) => {
  if (messages.some((message) => message.id === realtimeMessage.id)) {
    return messages;
  }
  return sortMessagesById([...messages, realtimeMessage]);
};
