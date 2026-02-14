"use client";

import MessagesShell from "@/app/app/_components/messages-shell";
import RoleGuard from "@/app/app/_components/role-guard";

export default function StudentMessagesPage() {
  return (
    <RoleGuard allowedRoles={["student"]}>
      <MessagesShell roleScope="student" />
    </RoleGuard>
  );
}
