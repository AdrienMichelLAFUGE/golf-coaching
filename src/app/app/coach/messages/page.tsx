"use client";

import MessagesShell from "@/app/app/_components/messages-shell";
import RoleGuard from "@/app/app/_components/role-guard";

export default function CoachMessagesPage() {
  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <MessagesShell roleScope="coach" />
    </RoleGuard>
  );
}
