import { auth } from "@/lib/utils/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/creditos — saldo e histórico do usuário
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const userId = session.user.id;

  const [user, transactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { creditsBalance: true, planType: true },
    }),
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        amount: true,
        type: true,
        description: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    balance: user?.creditsBalance ?? 0,
    planType: user?.planType ?? "free",
    transactions,
  });
}
