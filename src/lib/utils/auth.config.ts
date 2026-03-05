import type { NextAuthConfig } from "next-auth";

/**
 * Configuração leve do NextAuth para uso no middleware (edge runtime).
 * NÃO importa Prisma ou dependências Node-only.
 * Deve espelhar a session strategy do auth.ts principal.
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  // Deve ser igual ao auth.ts — JWT para funcionar com Credentials + PrismaAdapter
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "teacher";
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session({ session, token }: any) {
      if (session.user && token) {
        session.user.id = token.id ?? token.sub ?? "";
        session.user.role = token.role ?? "teacher";
      }
      return session;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    authorized({ auth }) {
      return true;
    },
  },
};
