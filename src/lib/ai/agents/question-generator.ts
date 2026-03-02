import { ChatOpenAI } from "@langchain/openai";
import { prisma } from "@/lib/db/prisma";
import { retrieveRelevantChunks } from "@/lib/ai/rag/retriever";
import { buildQuestionGenerationPrompt } from "@/lib/ai/rag/prompts";
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

const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.7,
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

  const prompt = buildQuestionGenerationPrompt({
    descriptorCode,
    descriptorDescription,
    gradeLevel,
    subject,
    relevantChunks,
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não está configurada. Configure a variável de ambiente.");
  }

  // Tentar até 3 vezes em caso de JSON inválido
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await llm.invoke([{ role: "user", content: prompt }]);
    const raw = String(response.content).trim();

    try {
      // Remover possível markdown code block
      const jsonStr = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(jsonStr);

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

    if (attempt === 3) {
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
  descriptorId: number
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO question_bank (
      id, descriptor_id, stem, option_a, option_b, option_c, option_d,
      correct_answer, justification, difficulty, quality_score, times_used,
      flagged, created_at
    ) VALUES (
      gen_random_uuid(),
      ${descriptorId},
      ${question.stem},
      ${question.optionA},
      ${question.optionB},
      ${question.optionC},
      ${question.optionD},
      ${question.correctAnswer},
      ${question.justification},
      ${question.difficulty},
      0.80,
      0,
      false,
      NOW()
    )
  `;
}
