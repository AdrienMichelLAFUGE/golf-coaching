"use client";

/* eslint-disable @next/next/no-img-element */

import { getInitials, type CalendarEventParticipant } from "./utils";

type AvatarStackProps = {
  participants: CalendarEventParticipant[];
  maxVisible?: number;
};

export default function AvatarStack({ participants, maxVisible = 5 }: AvatarStackProps) {
  const visibleCount = Math.max(1, maxVisible);
  const visibleParticipants = participants.slice(0, visibleCount);
  const overflowCount = Math.max(0, participants.length - visibleParticipants.length);

  return (
    <div className="flex items-center">
      {visibleParticipants.map((participant, index) => (
        <div
          key={`${participant.studentId}-${participant.name}`}
          className={`relative ${index === 0 ? "ml-0" : "-ml-2"}`}
          title={participant.name}
        >
          {participant.avatarUrl ? (
            <img
              src={participant.avatarUrl}
              alt={participant.name}
              className="h-7 w-7 rounded-full border border-white/40 object-cover shadow-[0_6px_12px_rgba(0,0,0,0.22)]"
            />
          ) : (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-[var(--panel-strong)] text-[0.6rem] font-semibold text-[var(--text)] shadow-[0_6px_12px_rgba(0,0,0,0.18)]">
              {getInitials(participant.name)}
            </span>
          )}
        </div>
      ))}

      {overflowCount > 0 ? (
        <span className="-ml-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/40 bg-white/15 px-1 text-[0.6rem] font-semibold text-[var(--text)] shadow-[0_6px_12px_rgba(0,0,0,0.18)]">
          +{overflowCount}
        </span>
      ) : null}
    </div>
  );
}
