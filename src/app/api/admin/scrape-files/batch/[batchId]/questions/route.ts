import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

interface ExtractedQuestionWithSource {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  descriptorCode: string;
  difficulty: string;
  sourceId: string;
  fileName: string;
}

// GET /api/admin/scrape-files/batch/[batchId]/questions — todas as questões extraídas do batch
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const { batchId } = await params;

  const allSources = await prisma.scrapedSource.findMany({
    where: {
      batchId,
      status: { in: ["extracted", "ingested"] },
    },
    select: {
      id: true,
      fileName: true,
      extractedData: true,
      questionsFound: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const sources = allSources.filter((s) => s.extractedData !== null);

  const questions: ExtractedQuestionWithSource[] = [];
  const totalByFile: { sourceId: string; fileName: string; count: number }[] = [];

  for (const source of sources) {
    const data = source.extractedData as unknown[];
    if (!Array.isArray(data)) continue;

    const sourceQuestions = data.map((q: unknown) => {
      const question = q as Record<string, string>;
      return {
        stem: question.stem ?? "",
        optionA: question.optionA ?? "",
        optionB: question.optionB ?? "",
        optionC: question.optionC ?? "",
        optionD: question.optionD ?? "",
        correctAnswer: question.correctAnswer ?? "",
        descriptorCode: question.descriptorCode ?? "",
        difficulty: question.difficulty ?? "",
        sourceId: source.id,
        fileName: source.fileName,
      };
    });

    questions.push(...sourceQuestions);
    totalByFile.push({
      sourceId: source.id,
      fileName: source.fileName,
      count: sourceQuestions.length,
    });
  }

  return NextResponse.json({ questions, totalByFile, total: questions.length });
}
