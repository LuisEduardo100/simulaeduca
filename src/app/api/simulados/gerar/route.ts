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
  descriptors?: DescriptorRequest[];
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
  const { examId, difficulty: globalDifficulty, resume } = body;
  let { descriptors } = body;

  if (!examId) {
    return NextResponse.json(
      { error: "examId é obrigatório." },
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

  // Garantir narrowing para closures internas
  const validExam = exam;

  // Se é retomada, recuperar descritores salvos no exam
  if (resume && (!descriptors || descriptors.length === 0)) {
    const saved = exam.descriptorDistribution as DescriptorRequest[] | null;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      descriptors = saved;
    } else {
      return NextResponse.json(
        { error: "Não foi possível retomar: distribuição de descritores não encontrada." },
        { status: 400 }
      );
    }
  }

  if (!descriptors || descriptors.length === 0) {
    return NextResponse.json(
      { error: "Ao menos um descritor é obrigatório." },
      { status: 400 }
    );
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

  // Atualizar status para "generating", salvar expectedQuestions e distribuição
  await prisma.exam.update({
    where: { id: examId },
    data: {
      status: "generating",
      expectedQuestions: totalExpected,
      descriptorDistribution: descriptors as unknown as import("@prisma/client").Prisma.InputJsonValue,
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

  // Pré-buscar todos os descritores em batch (evita N queries no loop)
  const uniqueDescriptorIds = [...new Set(questionPlan.map((q) => q.descriptorId))];
  const descriptorsData = await prisma.descriptor.findMany({
    where: { id: { in: uniqueDescriptorIds } },
  });
  const descriptorMap = new Map(descriptorsData.map((d) => [d.id, d]));

  // Verificar se todos os descritores existem
  for (const id of uniqueDescriptorIds) {
    if (!descriptorMap.has(id)) {
      return NextResponse.json(
        { error: `Descritor ID ${id} não encontrado.` },
        { status: 400 }
      );
    }
  }

  // Função para gerar uma única questão com retries e validação
  async function generateSingleQuestion(
    planItem: { descriptorId: number; difficulty: Difficulty },
    questionIndex: number
  ): Promise<{ question: GeneratedQuestion; descriptorId: number; questionNumber: number } | null> {
    const descriptor = descriptorMap.get(planItem.descriptorId)!;
    const MAX_ATTEMPTS = 4;
    let question: GeneratedQuestion | null = null;
    let bestFallback: GeneratedQuestion | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let generated: GeneratedQuestion;
      try {
        generated = await generateQuestion({
          descriptorId: planItem.descriptorId,
          descriptorCode: descriptor.code,
          descriptorDescription: descriptor.description,
          gradeLevelSlug: validExam.gradeLevel.slug,
          subjectSlug: validExam.subject.slug,
          evaluationSlug: validExam.evaluation.slug,
          gradeLevel: validExam.gradeLevel.name,
          subject: validExam.subject.name,
          difficulty: planItem.difficulty,
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

    if (!question) return null;

    return { question, descriptorId: planItem.descriptorId, questionNumber: questionIndex + 1 };
  }

  const BATCH_SIZE = 5;
  const remainingPlan = questionPlan.slice(startIndex);

  try {
    for (let batchStart = 0; batchStart < remainingPlan.length; batchStart += BATCH_SIZE) {
      const batch = remainingPlan.slice(batchStart, batchStart + BATCH_SIZE);
      const batchPromises = batch.map((item, idx) =>
        generateSingleQuestion(item, startIndex + batchStart + idx)
      );

      const results = await Promise.allSettled(batchPromises);

      // Processar resultados do batch sequencialmente (persistir, créditos)
      let batchFailed = false;
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const globalIdx = startIndex + batchStart + j;

        if (result.status === "rejected" || !result.value) {
          // Questão falhou — marcar como partial e parar
          batchFailed = true;
          await prisma.exam.update({
            where: { id: examId },
            data: { status: "partial", totalQuestions: generatedCount },
          });

          return NextResponse.json({
            success: false,
            examId,
            questionsGenerated: generatedCount,
            totalExpected,
            error: `Falha ao gerar questão ${globalIdx + 1}. ${generatedCount} questão(ões) foram salvas.`,
          }, { status: 207 });
        }

        const { question, descriptorId, questionNumber } = result.value;

        // Persistir questão
        await prisma.examQuestion.create({
          data: {
            examId,
            questionNumber,
            descriptorId,
            stem: question.stem,
            optionA: question.optionA,
            optionB: question.optionB,
            optionC: question.optionC,
            optionD: question.optionD,
            correctAnswer: question.correctAnswer,
            justification: question.justification,
            difficulty: question.difficulty,
            generationModel: "gpt-4o-mini",
          },
        });

        // Deduzir crédito
        await deductCredits(
          userId,
          1,
          examId,
          `Questão ${questionNumber} de ${totalExpected} — simulado ${examId.slice(0, 8)}`
        );
        totalCreditsDeducted++;
        generatedCount++;

        // Atualizar progresso do exam imediatamente por questão
        await prisma.exam.update({
          where: { id: examId },
          data: {
            totalQuestions: generatedCount,
            creditsConsumed: { increment: 1 },
          },
        });

        // Salvar no banco de questões (não bloquear)
        saveToQuestionBank(question, descriptorId).catch(() => {});
      }

      if (batchFailed) break;
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
