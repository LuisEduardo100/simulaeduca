import { prisma } from "@/lib/db/prisma";
import {
  generateQuestion,
  saveToQuestionBank,
  findReusableQuestion,
} from "@/lib/ai/agents/question-generator";
import { validateQuestion } from "@/lib/ai/agents/question-validator";
import { deductCredits } from "@/lib/billing/credits";
import { publishProgress } from "./generation-queue";
import type { GenerationJobData } from "./generation-queue";
import type { GeneratedQuestion } from "@/lib/ai/agents/question-generator";
import type { Difficulty, CorrectAnswer } from "@/types";

const CONCURRENCY = 8;

/**
 * Process a generation job. Called by BullMQ worker.
 * Publishes progress events to Redis pub/sub for SSE consumers.
 */
export async function processGenerationJob(
  jobId: string,
  data: GenerationJobData
): Promise<void> {
  const {
    examId,
    userId,
    descriptors,
    globalDifficulty,
    reuseRatio,
    resume,
    examData,
    totalExpected,
  } = data;

  const existingNumbers = new Set(data.existingNumbers);
  const alreadyGenerated = existingNumbers.size;

  // Pre-fetch descriptor data
  const uniqueDescriptorIds = [
    ...new Set(descriptors.map((d) => d.descriptorId)),
  ];
  const descriptorsData = await prisma.descriptor.findMany({
    where: { id: { in: uniqueDescriptorIds } },
  });
  const descriptorMap = new Map(descriptorsData.map((d) => [d.id, d]));

  // Publish init event
  await publishProgress(jobId, {
    type: "init",
    data: { examId, totalExpected, alreadyGenerated },
  });

  // Build question plan
  const questionPlan: {
    descriptorId: number;
    difficulty: Difficulty;
    questionNumber: number;
  }[] = [];
  const difficulties: Difficulty[] = ["facil", "medio", "dificil"];
  let qNum = 0;

  for (const desc of descriptors) {
    for (let q = 0; q < desc.questionCount; q++) {
      qNum++;
      let diff: Difficulty;
      if ((globalDifficulty as string) === "misto") {
        diff = difficulties[Math.floor(Math.random() * difficulties.length)];
      } else if (globalDifficulty && (globalDifficulty as string) !== "misto") {
        diff = globalDifficulty as Difficulty;
      } else if (desc.difficulty) {
        diff = desc.difficulty;
      } else {
        diff = "medio";
      }
      questionPlan.push({
        descriptorId: desc.descriptorId,
        difficulty: diff,
        questionNumber: qNum,
      });
    }
  }

  const remainingPlan = resume
    ? questionPlan.filter((p) => !existingNumbers.has(p.questionNumber))
    : questionPlan;

  let completed = alreadyGenerated;
  let totalCreditsDeducted = 0;
  let reusedCount = 0;
  let failedCount = 0;

  async function generateSingleQuestion(planItem: {
    descriptorId: number;
    difficulty: Difficulty;
    questionNumber: number;
  }): Promise<{
    question: GeneratedQuestion;
    descriptorId: number;
    questionNumber: number;
    reused: boolean;
    questionBankId: string | null;
  } | null> {
    const descriptor = descriptorMap.get(planItem.descriptorId)!;

    // Try reuse first
    const shouldTryReuse = Math.random() < reuseRatio;
    if (shouldTryReuse) {
      try {
        const reused = await findReusableQuestion(
          planItem.descriptorId,
          planItem.difficulty,
          examId,
          userId
        );
        if (reused) {
          return {
            question: {
              stem: reused.stem,
              optionA: reused.optionA,
              optionB: reused.optionB,
              optionC: reused.optionC,
              optionD: reused.optionD,
              correctAnswer: reused.correctAnswer as CorrectAnswer,
              justification: reused.justification ?? "",
              difficulty: (reused.difficulty ?? planItem.difficulty) as Difficulty,
              descriptorCode: descriptor.code,
              hasImage: reused.hasImage ?? false,
              imageDescription: reused.imageDescription ?? undefined,
              imageUrl: reused.imageUrl ?? undefined,
            },
            descriptorId: planItem.descriptorId,
            questionNumber: planItem.questionNumber,
            reused: true,
            questionBankId: reused.id,
          };
        }
      } catch (err) {
        console.warn(
          `[gerar-worker] Reuso falhou para ${descriptor.code}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // Generate via LLM
    const MAX_ATTEMPTS = 4;
    let question: GeneratedQuestion | null = null;
    let bestFallback: GeneratedQuestion | null = null;
    let bestFallbackErrorCount = Infinity;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let generated: GeneratedQuestion;
      try {
        generated = await generateQuestion({
          descriptorId: planItem.descriptorId,
          descriptorCode: descriptor.code,
          descriptorDescription: descriptor.description,
          gradeLevelSlug: examData.gradeLevelSlug,
          subjectSlug: examData.subjectSlug,
          evaluationSlug: examData.evaluationSlug,
          gradeLevel: examData.gradeLevelName,
          subject: examData.subjectName,
          difficulty: planItem.difficulty,
        });
      } catch {
        continue;
      }

      const validation = await validateQuestion(
        generated,
        descriptor.code,
        descriptor.description
      );

      if (validation.isValid) {
        question = generated;
        break;
      }

      if (validation.errors.length < bestFallbackErrorCount) {
        bestFallback = generated;
        bestFallbackErrorCount = validation.errors.length;
      }
    }

    if (!question && bestFallback) {
      console.warn(
        `[gerar-worker] Q${planItem.questionNumber} (${descriptor.code}) usou fallback com ${bestFallbackErrorCount} erro(s).`
      );
      question = bestFallback;
    }

    if (!question) return null;

    return {
      question,
      descriptorId: planItem.descriptorId,
      questionNumber: planItem.questionNumber,
      reused: false,
      questionBankId: null,
    };
  }

  async function persistAndPublish(
    result: NonNullable<Awaited<ReturnType<typeof generateSingleQuestion>>>
  ) {
    const {
      question,
      descriptorId,
      questionNumber,
      reused: isReused,
      questionBankId,
    } = result;

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
        hasImage: question.hasImage ?? false,
        imageDescription: question.imageDescription ?? null,
        imageUrl: question.imageUrl ?? null,
        generationModel: isReused ? "reused" : "gpt-4.1-mini",
        questionBankId,
        source: isReused ? "reused" : "generated",
      },
    });

    if (isReused && questionBankId) {
      reusedCount++;
      await prisma.questionUsage
        .create({ data: { questionBankId, examId, userId } })
        .catch(() => {});
      await prisma.$executeRawUnsafe(
        `UPDATE question_bank SET times_used = times_used + 1 WHERE id = $1::uuid`,
        questionBankId
      ).catch(() => {});
    } else {
      await deductCredits(
        userId,
        1,
        examId,
        `Questão ${questionNumber} de ${totalExpected} — simulado ${examId.slice(0, 8)}`
      );
      totalCreditsDeducted++;
    }

    completed++;

    await prisma.exam.update({
      where: { id: examId },
      data: {
        totalQuestions: { increment: 1 },
        ...(isReused ? {} : { creditsConsumed: { increment: 1 } }),
      },
    });

    await publishProgress(jobId, {
      type: "question",
      data: {
        questionNumber,
        descriptorCode: question.descriptorCode,
        reused: isReused,
        completed,
        totalExpected,
      },
    });

    // Save to question bank (non-blocking)
    if (!isReused) {
      saveToQuestionBank(question, descriptorId, {
        subjectSlug: examData.subjectSlug,
        gradeLevelSlug: examData.gradeLevelSlug,
        evaluationSlug: examData.evaluationSlug,
      }).catch(() => {});
    }
  }

  // --- Concurrency pool ---
  try {
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < remainingPlan.length; i++) {
      const planItem = remainingPlan[i];

      const task: Promise<void> = (async () => {
        try {
          const result = await generateSingleQuestion(planItem);

          if (!result) {
            failedCount++;
            await publishProgress(jobId, {
              type: "questionError",
              data: {
                questionNumber: planItem.questionNumber,
                error: `Falha ao gerar questão ${planItem.questionNumber} após múltiplas tentativas.`,
              },
            });
            return;
          }

          await persistAndPublish(result);
        } catch (err) {
          failedCount++;
          await publishProgress(jobId, {
            type: "questionError",
            data: {
              questionNumber: planItem.questionNumber,
              error: err instanceof Error ? err.message : "Erro inesperado.",
            },
          });
        }
      })().finally(() => executing.delete(task));

      executing.add(task);

      if (executing.size >= CONCURRENCY) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);

    // Finalize exam
    const finalStatus =
      failedCount > 0 && completed < totalExpected ? "partial" : "completed";
    await prisma.exam.update({
      where: { id: examId },
      data: {
        status: finalStatus,
        ...(finalStatus === "completed" ? { completedAt: new Date() } : {}),
      },
    });

    await publishProgress(jobId, {
      type: finalStatus === "completed" ? "complete" : "partial",
      data: {
        examId,
        questionsGenerated: completed,
        questionsReused: reusedCount,
        creditsUsed: totalCreditsDeducted,
        totalExpected,
        failedCount,
      },
    });
  } catch (error) {
    const finalStatus = completed > alreadyGenerated ? "partial" : "failed";
    await prisma.exam
      .update({
        where: { id: examId },
        data: { status: finalStatus, totalQuestions: completed },
      })
      .catch(() => {});

    await publishProgress(jobId, {
      type: "error",
      data: {
        examId,
        questionsGenerated: completed,
        totalExpected,
        error:
          error instanceof Error ? error.message : "Erro interno na geração.",
      },
    });
  }
}
