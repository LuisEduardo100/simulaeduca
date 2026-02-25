import NextAuth from "next-auth";
import { authConfig } from "@/lib/utils/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const isLoggedIn = !!session;
  const isAdmin = session?.user?.role === "admin";

  const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard") ||
    nextUrl.pathname.startsWith("/simulados") ||
    nextUrl.pathname.startsWith("/creditos") ||
    nextUrl.pathname.startsWith("/configuracoes");

  const isAdminRoute = nextUrl.pathname.startsWith("/admin");

  // Proteger rotas do dashboard — redirecionar para login se não autenticado
  if (isDashboardRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Proteger rotas admin — redirecionar para dashboard se não for admin
  if (isAdminRoute && !isAdmin) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/simulados/:path*",
    "/creditos/:path*",
    "/configuracoes/:path*",
    "/admin/:path*",
  ],
};
