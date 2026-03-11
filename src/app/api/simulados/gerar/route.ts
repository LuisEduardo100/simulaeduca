import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateQuestion, saveToQuestionBank, findReusableQuestion } from "@/lib/ai/agents/question-generator";
import { validateQuestion } from "@/lib/ai/agents/question-validator";
import { hasEnoughCredits, deductCredits } from "@/lib/billing/credits";
import { isRedisReady, redisSub } from "@/lib/cache/redis";
import { rateLimitOrNull } from "@/lib/cache/rate-limiter";
import {
  getGenerationQueue,
  GENERATION_PROGRESS_PREFIX,
  type GenerationProgressEvent,
} from "@/lib/queue/generation-queue";
import type { GeneratedQuestion } from "@/lib/ai/agents/question-generator";
import type { Difficulty, CorrectAnswer } from "@/types";

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
  reuseRatio?: number;
  resume?: boolean;
}

const CONCURRENCY = 8;

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Rate limit: max 5 generation requests per minute per user
  const rl = await rateLimitOrNull(session.user.id, "generation");
  if (rl) {
    return NextResponse.json({ error: rl.error }, { status: rl.status, headers: rl.headers });
  }

  let body: GenerarRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body da requisição inválido." }, { status: 400 });
  }
  const { examId, difficulty: globalDifficulty, resume, reuseRatio = 0.5 } = body;
  let { descriptors } = body;

  if (!examId) {
    return NextResponse.json({ error: "examId é obrigatório." }, { status: 400 });
  }

  const userId = session.user.id;

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

  const validExam = exam;

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

  const totalExpected = descriptors.reduce((sum, d) => sum + d.questionCount, 0);
  const existingNumbers = new Set(exam.questions.map((q) => q.questionNumber));
  const alreadyGenerated = existingNumbers.size;
  const creditsNeeded = totalExpected - alreadyGenerated;

  if (creditsNeeded <= 0 && resume) {
    return NextResponse.json({
      success: true,
      examId,
      questionsGenerated: alreadyGenerated,
      message: "Todas as questões já foram geradas.",
    });
  }

  const sufficient = await hasEnoughCredits(userId, creditsNeeded);
  if (!sufficient) {
    return NextResponse.json(
      { error: `Créditos insuficientes. Necessário: ${creditsNeeded}.` },
      { status: 402 }
    );
  }

  // Pre-fetch descriptors
  const uniqueDescriptorIds = [...new Set(descriptors.map((d) => d.descriptorId))];
  const descriptorsData = await prisma.descriptor.findMany({
    where: { id: { in: uniqueDescriptorIds } },
  });
  const descriptorMap = new Map(descriptorsData.map((d) => [d.id, d]));

  for (const id of uniqueDescriptorIds) {
    if (!descriptorMap.has(id)) {
      return NextResponse.json(
        { error: `Descritor ID ${id} não encontrado.` },
        { status: 400 }
      );
    }
  }

  await prisma.exam.update({
    where: { id: examId },
    data: {
      status: "generating",
      expectedQuestions: totalExpected,
      descriptorDistribution: descriptors as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  });

  // ─── BullMQ path: enqueue job + SSE bridge from Redis pub/sub ───
  if (isRedisReady()) {
    try {
      const queue = getGenerationQueue();
      const job = await queue.add(
        `exam-${examId.slice(0, 8)}`,
        {
          examId,
          userId,
          descriptors,
          globalDifficulty,
          reuseRatio,
          resume: !!resume,
          examData: {
            evaluationSlug: validExam.evaluation.slug,
            evaluationName: validExam.evaluation.name,
            subjectSlug: validExam.subject.slug,
            subjectName: validExam.subject.name,
            gradeLevelSlug: validExam.gradeLevel.slug,
            gradeLevelName: validExam.gradeLevel.name,
          },
          existingNumbers: [...existingNumbers],
          totalExpected,
        },
        {
          jobId: `gen-${examId}-${Date.now()}`,
        }
      );

      const jobId = job.id!;
      return createSSEBridge(jobId, examId, totalExpected, alreadyGenerated);
    } catch (err) {
      console.warn("[gerar] BullMQ enqueue failed, falling back to direct:", err instanceof Error ? err.message : err);
      // Fall through to direct generation
    }
  }

  // ─── Fallback: direct SSE generation (when Redis unavailable) ───
  return createDirectSSEStream(
    examId,
    userId,
    validExam,
    descriptors,
    descriptorMap,
    globalDifficulty,
    reuseRatio,
    totalExpected,
    alreadyGenerated,
    existingNumbers,
    !!resume
  );
}

/**
 * SSE bridge: subscribes to Redis pub/sub channel and forwards events to client.
 */
function createSSEBridge(jobId: string, examId: string, totalExpected: number, alreadyGenerated: number): Response {
  const encoder = new TextEncoder();
  const channel = `${GENERATION_PROGRESS_PREFIX}${jobId}`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };

      // Send init event immediately so the client knows totalExpected
      // before the worker publishes its own init (which may arrive late)
      send("init", { examId, totalExpected, alreadyGenerated });

      // Subscribe to progress channel
      const messageHandler = (_ch: string, message: string) => {
        try {
          const evt: GenerationProgressEvent = JSON.parse(message);
          send(evt.type, evt.data);

          // Close stream on terminal events
          if (["complete", "partial", "error"].includes(evt.type)) {
            setTimeout(() => {
              try {
                redisSub.unsubscribe(channel);
                redisSub.removeListener("message", messageHandler);
                controller.close();
              } catch {
                // Already closed
              }
            }, 500);
          }
        } catch {
          // Malformed message
        }
      };

      redisSub.on("message", messageHandler);
      await redisSub.subscribe(channel);

      // Safety timeout: close SSE after 10 min max
      const safetyTimeout = setTimeout(() => {
        try {
          redisSub.unsubscribe(channel);
          redisSub.removeListener("message", messageHandler);
          send("error", { error: "Timeout: geração excedeu 10 minutos." });
          controller.close();
        } catch {
          // Already closed
        }
      }, 600000);

      // Clean up if client disconnects
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      // Periodic heartbeat to detect disconnections
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          clearTimeout(safetyTimeout);
          redisSub.unsubscribe(channel).catch(() => {});
          redisSub.removeListener("message", messageHandler);
        }
      }, 15000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Direct SSE generation (fallback when Redis/BullMQ unavailable).
 * This is the original generation logic, kept for resilience.
 */
function createDirectSSEStream(
  examId: string,
  userId: string,
  validExam: {
    evaluation: { slug: string; name: string };
    subject: { slug: string; name: string };
    gradeLevel: { slug: string; name: string };
  },
  descriptors: DescriptorRequest[],
  descriptorMap: Map<number, { id: number; code: string; description: string }>,
  globalDifficulty: Difficulty | "misto" | undefined,
  reuseRatio: number,
  totalExpected: number,
  alreadyGenerated: number,
  existingNumbers: Set<number>,
  resume: boolean
): Response {
  const encoder = new TextEncoder();

  // Build question plan
  const questionPlan: { descriptorId: number; difficulty: Difficulty; questionNumber: number }[] = [];
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
      questionPlan.push({ descriptorId: desc.descriptorId, difficulty: diff, questionNumber: qNum });
    }
  }

  const remainingPlan = resume
    ? questionPlan.filter((p) => !existingNumbers.has(p.questionNumber))
    : questionPlan;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream closed by client
        }
      };

      send("init", { examId, totalExpected, alreadyGenerated });

      let completed = alreadyGenerated;
      let totalCreditsDeducted = 0;
      let reusedCount = 0;
      let failedCount = 0;

      async function generateSingleQuestion(
        planItem: { descriptorId: number; difficulty: Difficulty; questionNumber: number }
      ): Promise<{
        question: GeneratedQuestion;
        descriptorId: number;
        questionNumber: number;
        reused: boolean;
        questionBankId: string | null;
      } | null> {
        const descriptor = descriptorMap.get(planItem.descriptorId)!;

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
            console.warn(`[gerar] Reuso falhou para ${descriptor.code}:`, err instanceof Error ? err.message : err);
          }
        }

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
          console.warn(`[gerar] Q${planItem.questionNumber} (${descriptor.code}) usou fallback com ${bestFallbackErrorCount} erro(s).`);
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

      async function persistAndStream(
        result: NonNullable<Awaited<ReturnType<typeof generateSingleQuestion>>>
      ) {
        const { question, descriptorId, questionNumber, reused: isReused, questionBankId } = result;

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
          await prisma.questionUsage.create({
            data: { questionBankId, examId, userId },
          }).catch(() => {});
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

        send("question", {
          questionNumber,
          descriptorCode: question.descriptorCode,
          reused: isReused,
          completed,
          totalExpected,
        });

        if (!isReused) {
          saveToQuestionBank(question, descriptorId, {
            subjectSlug: validExam.subject.slug,
            gradeLevelSlug: validExam.gradeLevel.slug,
            evaluationSlug: validExam.evaluation.slug,
          }).catch(() => {});
        }
      }

      try {
        const executing = new Set<Promise<void>>();

        for (let i = 0; i < remainingPlan.length; i++) {
          const planItem = remainingPlan[i];

          const task: Promise<void> = (async () => {
            try {
              const result = await generateSingleQuestion(planItem);

              if (!result) {
                failedCount++;
                send("questionError", {
                  questionNumber: planItem.questionNumber,
                  error: `Falha ao gerar questão ${planItem.questionNumber} após múltiplas tentativas.`,
                });
                return;
              }

              await persistAndStream(result);
            } catch (err) {
              failedCount++;
              send("questionError", {
                questionNumber: planItem.questionNumber,
                error: err instanceof Error ? err.message : "Erro inesperado.",
              });
            }
          })().finally(() => executing.delete(task));

          executing.add(task);

          if (executing.size >= CONCURRENCY) {
            await Promise.race(executing);
          }
        }

        await Promise.all(executing);

        const finalStatus = failedCount > 0 && completed < totalExpected ? "partial" : "completed";
        await prisma.exam.update({
          where: { id: examId },
          data: {
            status: finalStatus,
            ...(finalStatus === "completed" ? { completedAt: new Date() } : {}),
          },
        });

        send(finalStatus === "completed" ? "complete" : "partial", {
          examId,
          questionsGenerated: completed,
          questionsReused: reusedCount,
          creditsUsed: totalCreditsDeducted,
          totalExpected,
          failedCount,
        });
      } catch (error) {
        const finalStatus = completed > alreadyGenerated ? "partial" : "failed";
        await prisma.exam.update({
          where: { id: examId },
          data: {
            status: finalStatus,
            totalQuestions: completed,
          },
        }).catch(() => {});

        send("error", {
          examId,
          questionsGenerated: completed,
          totalExpected,
          error: error instanceof Error ? error.message : "Erro interno na geração.",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
