"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { Badge, Button } from "@/components/ui";
import type { User } from "@/types/api";

type NavItem = { href: string; label: string; adminOnly?: boolean };

// All spec pages exist. "Users" is admin-only; "API docs" is a public page.
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/categories", label: "Categories" },
  { href: "/movements", label: "Movements" },
  { href: "/admin/users", label: "Users", adminOnly: true },
  { href: "/docs", label: "API docs" },
];

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const items = NAV.filter((item) => !item.adminOnly || user.role === "admin");

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-slate-900">StockPulse</span>
            <Badge tone="indigo">{user.role}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{user.name}</span>
            <Button variant="secondary" loading={signingOut} onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}