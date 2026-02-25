import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateQuestion, saveToQuestionBank } from "@/lib/ai/agents/question-generator";
import { validateQuestion } from "@/lib/ai/agents/question-validator";
import { hasEnoughCredits, deductCredits } from "@/lib/billing/credits";

interface DescriptorRequest {
  descriptorId: number;
  difficulty?: "facil" | "medio" | "dificil";
}

interface GenerarRequest {
  examId: string;
  descriptors: DescriptorRequest[];
}

// POST /api/simulados/gerar
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body: GenerarRequest = await request.json();
  const { examId, descriptors } = body;

  if (!examId || !Array.isArray(descriptors) || descriptors.length === 0) {
    return NextResponse.json(
      { error: "examId e ao menos um descritor são obrigatórios." },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const creditsNeeded = descriptors.length;

  // Verificar créditos
  const sufficient = await hasEnoughCredits(userId, creditsNeeded);
  if (!sufficient) {
    return NextResponse.json(
      { error: `Créditos insuficientes. Necessário: ${creditsNeeded}.` },
      { status: 402 }
    );
  }

  // Buscar exam e verificar ownership
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      evaluation: true,
      subject: true,
      gradeLevel: true,
    },
  });

  if (!exam || exam.userId !== userId) {
    return NextResponse.json({ error: "Simulado não encontrado." }, { status: 404 });
  }

  // Atualizar status para "generating"
  await prisma.exam.update({
    where: { id: examId },
    data: { status: "generating" },
  });

  const generatedQuestions = [];

  try {
    for (let i = 0; i < descriptors.length; i++) {
      const { descriptorId, difficulty } = descriptors[i];

      const descriptor = await prisma.descriptor.findUnique({
        where: { id: descriptorId },
      });

      if (!descriptor) {
        throw new Error(`Descritor ID ${descriptorId} não encontrado.`);
      }

      let question = null;
      let attempts = 0;

      while (attempts < 2) {
        attempts++;
        const generated = await generateQuestion({
          descriptorId,
          descriptorCode: descriptor.code,
          descriptorDescription: descriptor.description,
          gradeLevelSlug: exam.gradeLevel.slug,
          subjectSlug: exam.subject.slug,
          evaluationSlug: exam.evaluation.slug,
          gradeLevel: exam.gradeLevel.name,
          subject: exam.subject.name,
          difficulty,
        });

        const validation = await validateQuestion(
          generated,
          descriptor.code,
          descriptor.description
        );

        if (validation.isValid) {
          question = generated;
          break;
        }
      }

      if (!question) {
        throw new Error(`Falha ao gerar questão válida para descritor ${descriptor.code}.`);
      }

      // Salvar no banco
      const examQuestion = await prisma.examQuestion.create({
        data: {
          examId,
          questionNumber: i + 1,
          descriptorId,
          stem: question.stem,
          optionA: question.optionA,
          optionB: question.optionB,
          optionC: question.optionC,
          optionD: question.optionD,
          correctAnswer: question.correctAnswer,
          justification: question.justification,
          difficulty: question.difficulty,
          generationModel: "gpt-4o",
        },
      });

      // Salvar no banco de questões para reutilização futura
      await saveToQuestionBank(question, descriptorId).catch(() => {
        // Não bloquear se falhar
      });

      generatedQuestions.push(examQuestion);
    }

    // Debitar créditos e atualizar exam
    await deductCredits(
      userId,
      creditsNeeded,
      examId,
      `Geração de ${creditsNeeded} questão(ões) — simulado ${examId}`
    );

    await prisma.exam.update({
      where: { id: examId },
      data: {
        status: "completed",
        totalQuestions: generatedQuestions.length,
        creditsConsumed: creditsNeeded,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      examId,
      questionsGenerated: generatedQuestions.length,
    });
  } catch (error) {
    // Marcar como falha
    await prisma.exam.update({
      where: { id: examId },
      data: { status: "failed" },
    }).catch(() => {});

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno na geração." },
      { status: 500 }
    );
  }
}
