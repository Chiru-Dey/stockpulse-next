"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { AppShell } from "@/components/app-shell";
import { FullPageSpinner } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) return <FullPageSpinner label="Loading your workspace…" />;
  if (!user) return <FullPageSpinner label="Redirecting to sign in…" />;

  return <AppShell user={user}>{children}</AppShell>;
}