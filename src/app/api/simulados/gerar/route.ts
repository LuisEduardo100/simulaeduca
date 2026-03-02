import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateQuestion, saveToQuestionBank } from "@/lib/ai/agents/question-generator";
import { validateQuestion } from "@/lib/ai/agents/question-validator";
import { hasEnoughCredits, deductCredits } from "@/lib/billing/credits";
import type { GeneratedQuestion } from "@/lib/ai/agents/question-generator";
import type { Difficulty } from "@/types";

// Aumenta o limite de duração para rotas longas (26 questões)
export const maxDuration = 300;

interface DescriptorRequest {
  descriptorId: number;
  questionCount: number;
  difficulty?: Difficulty;
}

interface GenerarRequest {
  examId: string;
  descriptors: DescriptorRequest[];
  difficulty?: Difficulty | "misto";
  resume?: boolean; // se true, continua de onde parou
}

// POST /api/simulados/gerar
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: GenerarRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body da requisição inválido." }, { status: 400 });
  }
  const { examId, descriptors, difficulty: globalDifficulty, resume } = body;

  if (!examId || !Array.isArray(descriptors) || descriptors.length === 0) {
    return NextResponse.json(
      { error: "examId e ao menos um descritor são obrigatórios." },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  // Buscar exam e verificar ownership
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      evaluation: true,
      subject: true,
      gradeLevel: true,
      questions: { select: { questionNumber: true }, orderBy: { questionNumber: "asc" } },
    },
  });

  if (!exam || exam.userId !== userId) {
    return NextResponse.json({ error: "Simulado não encontrado." }, { status: 404 });
  }

  // Calcular total de questões esperadas a partir da distribuição
  const totalExpected = descriptors.reduce((sum, d) => sum + d.questionCount, 0);

  // Se é retomada, calcular quantas questões ainda faltam
  const alreadyGenerated = resume ? exam.questions.length : 0;
  const creditsNeeded = totalExpected - alreadyGenerated;

  if (creditsNeeded <= 0 && resume) {
    return NextResponse.json({
      success: true,
      examId,
      questionsGenerated: alreadyGenerated,
      message: "Todas as questões já foram geradas.",
    });
  }

  // Verificar créditos
  const sufficient = await hasEnoughCredits(userId, creditsNeeded);
  if (!sufficient) {
    return NextResponse.json(
      { error: `Créditos insuficientes. Necessário: ${creditsNeeded}.` },
      { status: 402 }
    );
  }

  // Atualizar status para "generating" e salvar expectedQuestions
  await prisma.exam.update({
    where: { id: examId },
    data: {
      status: "generating",
      expectedQuestions: totalExpected,
    },
  });

  // Expandir a lista de descritores em questões individuais
  // Ex: { descriptorId: 1, questionCount: 3 } => [1, 1, 1]
  const questionPlan: { descriptorId: number; difficulty: Difficulty }[] = [];
  const difficulties: Difficulty[] = ["facil", "medio", "dificil"];

  for (const desc of descriptors) {
    for (let q = 0; q < desc.questionCount; q++) {
      let diff: Difficulty;
      if (globalDifficulty === "misto") {
        diff = difficulties[Math.floor(Math.random() * difficulties.length)];
      } else if (globalDifficulty) {
        diff = globalDifficulty;
      } else if (desc.difficulty) {
        diff = desc.difficulty;
      } else {
        diff = "medio";
      }
      questionPlan.push({ descriptorId: desc.descriptorId, difficulty: diff });
    }
  }

  // Se é retomada, pular questões já geradas
  const startIndex = resume ? alreadyGenerated : 0;
  let generatedCount = alreadyGenerated;
  let totalCreditsDeducted = 0;

  try {
    for (let i = startIndex; i < questionPlan.length; i++) {
      const { descriptorId, difficulty } = questionPlan[i];

      const descriptor = await prisma.descriptor.findUnique({
        where: { id: descriptorId },
      });

      if (!descriptor) {
        throw new Error(`Descritor ID ${descriptorId} não encontrado.`);
      }

      // 4 tentativas com fallback inteligente
      const MAX_ATTEMPTS = 4;
      let question: GeneratedQuestion | null = null;
      let bestFallback: GeneratedQuestion | null = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let generated: GeneratedQuestion;
        try {
          generated = await generateQuestion({
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
        } catch {
          continue;
        }

        if (!bestFallback) bestFallback = generated;

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

      if (!question && bestFallback) {
        question = bestFallback;
      }

      if (!question) {
        // Marcar como partial — salvar o que já temos
        await prisma.exam.update({
          where: { id: examId },
          data: {
            status: "partial",
            totalQuestions: generatedCount,
          },
        });

        return NextResponse.json({
          success: false,
          examId,
          questionsGenerated: generatedCount,
          totalExpected,
          error: `Falha ao gerar questão ${i + 1} para descritor ${descriptorId}. ${generatedCount} questão(ões) foram salvas.`,
        }, { status: 207 }); // 207 Multi-Status
      }

      // Persistir questão imediatamente
      await prisma.examQuestion.create({
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

      // Deduzir 1 crédito imediatamente por questão
      await deductCredits(
        userId,
        1,
        examId,
        `Questão ${i + 1} de ${totalExpected} — simulado ${examId.slice(0, 8)}`
      );
      totalCreditsDeducted++;

      // Atualizar contagem no exam
      generatedCount++;
      await prisma.exam.update({
        where: { id: examId },
        data: {
          totalQuestions: generatedCount,
          creditsConsumed: { increment: 1 },
        },
      });

      // Salvar no banco de questões para reutilização futura (não bloquear)
      saveToQuestionBank(question, descriptorId).catch(() => {});
    }

    // Todas as questões geradas com sucesso
    await prisma.exam.update({
      where: { id: examId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      examId,
      questionsGenerated: generatedCount,
      totalExpected,
    });
  } catch (error) {
    // Se já gerou alguma questão, marcar como partial em vez de failed
    const finalStatus = generatedCount > 0 ? "partial" : "failed";

    await prisma.exam.update({
      where: { id: examId },
      data: {
        status: finalStatus,
        totalQuestions: generatedCount,
      },
    }).catch(() => {});

    if (finalStatus === "partial") {
      return NextResponse.json({
        success: false,
        examId,
        questionsGenerated: generatedCount,
        totalExpected,
        error: error instanceof Error ? error.message : "Erro na geração.",
      }, { status: 207 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno na geração." },
      { status: 500 }
    );
  }
}
