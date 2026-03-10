"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  LayoutDashboard,
  Plus,
  History,
  CreditCard,
  Settings,
  Database,
  Globe,
  LogOut,
  Gauge,
  Bot,
  HeartPulse,
  BarChart3,
} from "lucide-react";

interface MobileNavProps {
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
  { href: "/admin", label: "Painel Admin", icon: Gauge },
  { href: "/admin/agentes", label: "Agentes IA", icon: Bot },
  { href: "/admin/saude", label: "Saúde do Sistema", icon: HeartPulse },
  { href: "/admin/knowledge-base", label: "Base de Conhecimento", icon: Database },
  { href: "/admin/cobertura", label: "Cobertura RAG", icon: BarChart3 },
  { href: "/admin/scraping", label: "Scraping Web", icon: Globe },
];

export function MobileNav({ userEmail, userName, userRole }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile header bar */}
      <header className="md:hidden flex items-center justify-between border-b bg-card px-4 h-14">
        <Link href="/dashboard" className="text-lg font-bold text-primary">
          SimulaEduca
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "md:hidden fixed top-0 left-0 h-full w-72 z-50 bg-card border-r flex flex-col transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <span className="text-lg font-bold text-primary">SimulaEduca</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

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
                <Link href={item.href} onClick={() => setOpen(false)}>
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
                    <Link href={item.href} onClick={() => setOpen(false)}>
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
      </div>
    </>
  );
}
