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
    // Force a PNG favicon (and version it) because browsers aggressively cache /favicon.ico.
    // `src/app/icon.png` and `src/app/apple-icon.png` are served by Next's App Router file conventions.
    icon: [
      { url: "/icon.png?v=1", type: "image/png", sizes: "32x32" },
      { url: "/icon.png?v=1", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-icon.png?v=1", type: "image/png", sizes: "180x180" }],
    shortcut: [{ url: "/icon.png?v=1", type: "image/png" }],
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
