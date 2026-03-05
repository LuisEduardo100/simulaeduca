"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Plus,
  History,
  CreditCard,
  Settings,
  Database,
  Globe,
  LogOut,
} from "lucide-react";

interface SidebarProps {
  userEmail: string;
  userName?: string | null;
  userRole: string;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/simulados/novo", label: "Criar Simulado", icon: Plus },
  { href: "/simulados/historico", label: "Histórico", icon: History },
  { href: "/creditos", label: "Créditos", icon: CreditCard },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const adminItems = [
  { href: "/admin/knowledge-base", label: "Base de Conhecimento", icon: Database },
  { href: "/admin/scraping", label: "Scraping Web", icon: Globe },
];

export function Sidebar({ userEmail, userName, userRole }: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-card h-screen sticky top-0">
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">SimulaEduca</span>
        </Link>
      </div>

      <Separator />

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.href}
              variant={isActive(item.href) ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start text-sm gap-2",
                isActive(item.href) && "font-medium"
              )}
              asChild
            >
              <Link href={item.href}>
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </Button>
          );
        })}

        {userRole === "admin" && (
          <>
            <Separator className="my-2" />
            <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Admin
            </p>
            {adminItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  variant={isActive(item.href) ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start text-sm gap-2",
                    isActive(item.href) && "font-medium"
                  )}
                  asChild
                >
                  <Link href={item.href}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </>
        )}
      </nav>

      <Separator />

      <div className="p-4 space-y-2">
        <div className="px-2">
          {userName && (
            <div className="text-sm font-medium truncate">{userName}</div>
          )}
          <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
          <div className="text-xs text-muted-foreground mt-0.5 capitalize">
            {userRole === "admin" ? "Administrador" : "Professor"}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sm gap-2 text-muted-foreground hover:text-destructive"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
