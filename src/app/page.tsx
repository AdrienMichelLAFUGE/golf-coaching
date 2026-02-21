import type { Metadata } from "next";
import AuthHashRedirect from "./_components/auth-hash-redirect";
import LandingPage from "./landing/page";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return (
    <>
      <AuthHashRedirect />
      <LandingPage />
    </>
  );
}
