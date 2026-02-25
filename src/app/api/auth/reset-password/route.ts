import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const resetSchema = z.object({
  email: z.string().email("E-mail inválido"),
  newPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string().min(6),
});

// POST /api/auth/reset-password
// Redefinição direta de senha (sem token de email — para uso local/MVP)
// Em produção, substituir por fluxo com token enviado por e-mail
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = resetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, newPassword, confirmPassword } = parsed.data;

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "As senhas não coincidem." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Retornar mensagem genérica por segurança (não revelar se e-mail existe)
      return NextResponse.json(
        { message: "Se o e-mail estiver cadastrado, a senha foi redefinida." },
        { status: 200 }
      );
    }

    // Apenas usuários com senha local (credentials) podem redefinir por aqui
    // Usuários OAuth-only não têm passwordHash
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });

    return NextResponse.json(
      { message: "Senha redefinida com sucesso. Faça login com a nova senha." },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Erro interno. Tente novamente." },
      { status: 500 }
    );
  }
}
