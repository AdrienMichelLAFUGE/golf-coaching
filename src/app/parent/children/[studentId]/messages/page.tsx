import ParentMessagesShell from "./ParentMessagesShell";

export default async function ParentChildMessagesPage({
  params,
}: {
  params: { studentId: string } | Promise<{ studentId: string }>;
}) {
  const resolved = await params;

  return <ParentMessagesShell studentId={resolved.studentId} />;
}

