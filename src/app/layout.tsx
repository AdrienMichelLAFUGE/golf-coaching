import type { Metadata, Viewport } from "next";
import "./globals.css";

import { getSiteBaseUrl } from "@/lib/env/public";

const siteBaseUrl = getSiteBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(`${siteBaseUrl}/`),
  title: {
    default: "SwingFlow",
    template: "%s | SwingFlow",
  },
  description: "Plateforme de coaching golf pour centraliser le suivi eleve.",
  icons: {
    icon: [{ url: "/branding/logo.png" }],
    apple: [{ url: "/branding/logo.png" }],
    shortcut: [{ url: "/branding/logo.png" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "SwingFlow",
    title: "SwingFlow",
    description: "Plateforme de coaching golf pour centraliser le suivi eleve.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
