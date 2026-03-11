import { ChatOpenAI } from "@langchain/openai";
import { prisma } from "@/lib/db/prisma";
import { retrieveRelevantChunks } from "@/lib/ai/rag/retriever";
import { buildQuestionGenerationPrompt } from "@/lib/ai/rag/prompts";
import { generateEmbeddings } from "@/lib/ai/rag/embeddings";
import type { Difficulty, CorrectAnswer, GeneratedQuestion } from "@/types";

export type { GeneratedQuestion };

export interface QuestionGeneratorInput {
  descriptorId: number;
  descriptorCode: string;
  descriptorDescription: string;
  gradeLevelSlug: string;
  subjectSlug: string;
  evaluationSlug: string;
  gradeLevel: string;  // nome legível ex: "9º ano"
  subject: string;     // nome legível ex: "Matemática"
  difficulty?: Difficulty;
}

export interface ReusedQuestion {
  id: string;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  justification: string | null;
  difficulty: string | null;
  descriptorCode?: string;
  hasImage?: boolean;
  imageDescription?: string | null;
  imageUrl?: string | null;
}

// gpt-4.1-mini: melhor seguimento de instruções e saída JSON mais estável que gpt-4o-mini,
// reduzindo retentativas. Custo similar (~$0.40/$1.60 por 1M tokens vs $0.15/$0.60).
const llm = new ChatOpenAI({
  model: "gpt-4.1-mini",
  temperature: 0.7,
  modelKwargs: {
    response_format: { type: "json_object" },
  },
});

const LETTERS: CorrectAnswer[] = ["A", "B", "C", "D"];

/**
 * Embaralha as alternativas de uma questão gerada para que a resposta correta
 * não fique sempre na mesma posição (o LLM tende a colocar a correta em "A").
 */
function shuffleOptions(q: {
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: CorrectAnswer;
}): { optionA: string; optionB: string; optionC: string; optionD: string; correctAnswer: CorrectAnswer } {
  const options = [
    { letter: "A" as CorrectAnswer, text: q.optionA },
    { letter: "B" as CorrectAnswer, text: q.optionB },
    { letter: "C" as CorrectAnswer, text: q.optionC },
    { letter: "D" as CorrectAnswer, text: q.optionD },
  ];

  // Fisher-Yates shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  // Encontrar a nova posição da resposta correta
  const correctText = q[`option${q.correctAnswer}` as keyof typeof q] as string;
  const newCorrectIndex = options.findIndex((o) => o.text === correctText);

  return {
    optionA: options[0].text,
    optionB: options[1].text,
    optionC: options[2].text,
    optionD: options[3].text,
    correctAnswer: LETTERS[newCorrectIndex],
  };
}

/**
 * Busca uma questão reutilizável no question_bank.
 * Evita questões já usadas no mesmo exam e questões recentes do mesmo professor.
 */
export async function findReusableQuestion(
  descriptorId: number,
  difficulty: Difficulty | null,
  examId: string,
  userId: string
): Promise<ReusedQuestion | null> {
  const rows = await prisma.$queryRawUnsafe<ReusedQuestion[]>(`
    SELECT
      qb.id, qb.stem,
      qb.option_a AS "optionA", qb.option_b AS "optionB",
      qb.option_c AS "optionC", qb.option_d AS "optionD",
      qb.correct_answer AS "correctAnswer",
      qb.justification, qb.difficulty,
      qb.has_image AS "hasImage",
      qb.image_description AS "imageDescription",
      qb.image_url AS "imageUrl"
    FROM question_bank qb
    WHERE qb.descriptor_id = $1
      AND qb.flagged = false
      AND qb.validated = true
      AND qb.quality_score >= 0.70
      ${difficulty ? `AND qb.difficulty = $4` : ""}
      AND qb.id NOT IN (
        SELECT qu.question_bank_id FROM question_usages qu WHERE qu.exam_id = $2::uuid
      )
      AND qb.id NOT IN (
        SELECT qu2.question_bank_id FROM question_usages qu2
        WHERE qu2.user_id = $3::uuid
        ORDER BY qu2.used_at DESC
        LIMIT 200
      )
    ORDER BY qb.times_used ASC, RANDOM()
    LIMIT 1
  `,
    descriptorId,
    examId,
    userId,
    ...(difficulty ? [difficulty] : [])
  );

  return rows.length > 0 ? rows[0] : null;
}

export async function generateQuestion(
  input: QuestionGeneratorInput
): Promise<GeneratedQuestion> {
  const {
    descriptorCode,
    descriptorDescription,
    gradeLevelSlug,
    subjectSlug,
    evaluationSlug,
    gradeLevel,
    subject,
    difficulty,
  } = input;

  // Buscar chunks relevantes no pgvector (fallback para [] se RAG falhar)
  const query = `${descriptorCode} ${descriptorDescription}`;
  let relevantChunks: Awaited<ReturnType<typeof retrieveRelevantChunks>> = [];
  try {
    relevantChunks = await retrieveRelevantChunks(query, {
      descriptorCode,
      subjectSlug,
      gradeLevelSlug,
      evaluationSlug,
      topK: 5,
    });
  } catch (err) {
    console.warn(`[question-generator] RAG retrieval falhou para ${descriptorCode}, continuando sem contexto:`, err instanceof Error ? err.message : err);
  }

  // Buscar questões existentes do mesmo descritor para evitar duplicatas semânticas
  let existingQuestions: { stem: string; correctAnswer: string }[] = [];
  try {
    existingQuestions = await prisma.questionBank.findMany({
      where: { descriptor: { code: descriptorCode }, flagged: false },
      select: { stem: true, correctAnswer: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  } catch {
    // Não bloquear geração se busca falhar
  }

  const prompt = buildQuestionGenerationPrompt({
    descriptorCode,
    descriptorDescription,
    gradeLevel,
    subject,
    difficulty,
    relevantChunks,
    existingQuestions,
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não está configurada. Configure a variável de ambiente.");
  }

  // Tentar até 2 vezes (JSON mode garante saída válida; retry é safety net)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await llm.invoke([{ role: "user", content: prompt }]);
    const raw = String(response.content).trim();

    try {
      const parsed = JSON.parse(raw);

      const validAnswers = ["A", "B", "C", "D"];
      if (
        typeof parsed.stem === "string" &&
        typeof parsed.optionA === "string" &&
        typeof parsed.optionB === "string" &&
        typeof parsed.optionC === "string" &&
        typeof parsed.optionD === "string" &&
        validAnswers.includes(parsed.correctAnswer) &&
        typeof parsed.justification === "string"
      ) {
        // Embaralhar alternativas para distribuir o gabarito aleatoriamente
        const shuffled = shuffleOptions({
          optionA: parsed.optionA,
          optionB: parsed.optionB,
          optionC: parsed.optionC,
          optionD: parsed.optionD,
          correctAnswer: parsed.correctAnswer as CorrectAnswer,
        });

        return {
          stem: parsed.stem,
          ...shuffled,
          justification: parsed.justification,
          difficulty: (parsed.difficulty ?? "medio") as Difficulty,
          descriptorCode,
        };
      }
    } catch {
      // continuar para próxima tentativa
    }

    if (attempt === 2) {
      throw new Error(
        `Falha ao gerar questão para descritor ${descriptorCode} após ${attempt} tentativas.`
      );
    }
  }

  throw new Error("Erro inesperado na geração de questão.");
}

// Salvar questão no banco de questões para reutilização futura
export async function saveToQuestionBank(
  question: GeneratedQuestion,
  descriptorId: number,
  meta?: { subjectSlug?: string; gradeLevelSlug?: string; evaluationSlug?: string }
): Promise<string | null> {
  try {
    // Gerar embedding para busca semântica e dedup futura
    const content = `${question.stem}\nA) ${question.optionA}\nB) ${question.optionB}\nC) ${question.optionC}\nD) ${question.optionD}`;
    const [embedding] = await generateEmbeddings([content]);
    const vectorStr = `[${embedding.join(",")}]`;

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO question_bank (
        id, descriptor_id, stem, option_a, option_b, option_c, option_d,
        correct_answer, justification, difficulty, quality_score, times_used,
        flagged, origin, validated, has_image, image_description, image_url,
        subject_slug, grade_level_slug, evaluation_slug,
        embedding, created_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        0.80, 0, false, 'generated', true, $10, $11, $12,
        $13, $14, $15,
        $16::vector, NOW()
      )
      RETURNING id
    `,
      descriptorId,
      question.stem,
      question.optionA,
      question.optionB,
      question.optionC,
      question.optionD,
      question.correctAnswer,
      question.justification,
      question.difficulty,
      question.hasImage ?? false,
      question.imageDescription ?? null,
      question.imageUrl ?? null,
      meta?.subjectSlug ?? null,
      meta?.gradeLevelSlug ?? null,
      meta?.evaluationSlug ?? null,
      vectorStr
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error("[saveToQuestionBank] Erro:", err);
    return null;
  }
}
