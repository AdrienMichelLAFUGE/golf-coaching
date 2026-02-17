import ParentShell from "./ParentShell";

export default function ParentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ParentShell>{children}</ParentShell>;
}
