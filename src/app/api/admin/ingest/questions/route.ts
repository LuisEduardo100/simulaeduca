import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingestQuestions, ingestExtractedToQuestionBank } from "@/lib/ai/rag/ingest";

const questionSchema = z.object({
  stem: z.string().min(20),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctAnswer: z.string().optional(),
  descriptorCode: z.string().optional(),
  difficulty: z.enum(["facil", "medio", "dificil"]).optional(),
  subjectSlug: z.string().optional(),
  gradeLevelSlug: z.string().optional(),
  evaluationSlug: z.string().optional(),
  hasImage: z.boolean().optional(),
  imageDescription: z.string().optional(),
  imageUrl: z.string().optional(),
});

const schema = z.object({
  questions: z.array(questionSchema).min(1).max(200),
  sourceUrl: z.string().optional(),
  sourceFileName: z.string().optional(),
  sourceId: z.string().uuid().optional(), // ScrapedSource ID para tracking
});

// POST /api/admin/ingest/questions
// Ingere questões estruturadas extraídas via IA, uma por chunk no material_chunks.
// Cada questão carrega seu próprio descriptor_code, difficulty e metadata global.
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { questions, sourceUrl, sourceFileName: explicitFileName, sourceId } = parsed.data;

  let sourceFileName: string | undefined = explicitFileName;
  if (!sourceFileName && sourceUrl) {
    try {
      sourceFileName = `web-${new URL(sourceUrl).hostname}`;
    } catch {
      // URL inválida — continua sem sourceFileName
    }
  }

  const result = await ingestQuestions(questions, session.user.id, sourceFileName);

  // Também inserir no question_bank para reuso futuro (fire-and-forget)
  ingestExtractedToQuestionBank(questions, sourceFileName).catch((err) => {
    console.warn("[ingest/questions] Falha ao inserir no question_bank:", err);
  });

  // Atualizar ScrapedSource se fornecido
  if (sourceId && result.inserted > 0) {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.scrapedSource.update({
      where: { id: sourceId },
      data: {
        questionsIngested: { increment: result.inserted },
        chunksCreated: { increment: result.inserted },
        status: "ingested",
      },
    }).catch(() => {});
  }

  return NextResponse.json(result);
}
