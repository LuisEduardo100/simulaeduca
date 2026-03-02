import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { GenerationProgressData } from "@/types";

// GET /api/simulados/[id]/progresso
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      totalQuestions: true,
      expectedQuestions: true,
      questions: {
        select: {
          questionNumber: true,
          descriptor: { select: { code: true } },
        },
        orderBy: { questionNumber: "asc" },
      },
    },
  });

  if (!exam || exam.userId !== session.user.id) {
    return NextResponse.json({ error: "Simulado não encontrado." }, { status: 404 });
  }

  const progress: GenerationProgressData = {
    examId: exam.id,
    status: exam.status as GenerationProgressData["status"],
    totalExpected: exam.expectedQuestions,
    totalGenerated: exam.totalQuestions,
    questions: exam.questions.map((q) => ({
      questionNumber: q.questionNumber,
      descriptorCode: q.descriptor.code,
      status: "completed" as const,
    })),
  };

  return NextResponse.json(progress);
}
