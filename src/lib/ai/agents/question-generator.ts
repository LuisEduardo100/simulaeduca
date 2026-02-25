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

  // Buscar chunks relevantes no pgvector
  const query = `${descriptorCode} ${descriptorDescription}`;
  const relevantChunks = await retrieveRelevantChunks(query, {
    descriptorCode,
    subjectSlug,
    gradeLevelSlug,
    evaluationSlug,
    topK: 5,
  });

  const prompt = buildQuestionGenerationPrompt({
    descriptorCode,
    descriptorDescription,
    gradeLevel,
    subject,
    relevantChunks,
  });

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
        return {
          stem: parsed.stem,
          optionA: parsed.optionA,
          optionB: parsed.optionB,
          optionC: parsed.optionC,
          optionD: parsed.optionD,
          correctAnswer: parsed.correctAnswer as CorrectAnswer,
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
