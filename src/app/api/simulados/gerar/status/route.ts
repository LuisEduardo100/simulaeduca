import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/simulados/gerar/status?examId=...
 * Polling endpoint for generation progress when SSE disconnects.
 */
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const examId = request.nextUrl.searchParams.get("examId");
  if (!examId) {
    return NextResponse.json({ error: "examId é obrigatório." }, { status: 400 });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      status: true,
      totalQuestions: true,
      expectedQuestions: true,
      creditsConsumed: true,
      userId: true,
    },
  });

  if (!exam || exam.userId !== session.user.id) {
    return NextResponse.json({ error: "Simulado não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    examId: exam.id,
    status: exam.status,
    questionsGenerated: exam.totalQuestions,
    totalExpected: exam.expectedQuestions,
    creditsUsed: exam.creditsConsumed,
    isComplete: ["completed", "partial", "failed"].includes(exam.status),
  });
}
