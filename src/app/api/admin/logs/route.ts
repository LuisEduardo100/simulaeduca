import { auth } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const type = searchParams.get("type"); // usage, purchase, bonus, subscription

  try {
    const where = type ? { type } : {};

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          amount: true,
          type: true,
          description: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          exam: { select: { id: true, title: true } },
        },
      }),
      prisma.creditTransaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
        userName: t.user.name ?? "Sem nome",
        userEmail: t.user.email,
        examId: t.exam?.id ?? null,
        examTitle: t.exam?.title ?? null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[admin/logs] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
