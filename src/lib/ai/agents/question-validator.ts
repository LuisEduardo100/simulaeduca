import { ChatOpenAI } from "@langchain/openai";
import { buildValidationPrompt } from "@/lib/ai/rag/prompts";
import type { GeneratedQuestion } from "@/types";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

const validatorLlm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
});

function validateStructure(question: GeneratedQuestion): ValidationResult {
  const errors: string[] = [];

  if (!question.stem || question.stem.trim().length < 20) {
    errors.push("Enunciado muito curto (mínimo 20 caracteres).");
  }
  if (!question.optionA || question.optionA.trim().length < 5) {
    errors.push("Alternativa A muito curta.");
  }
  if (!question.optionB || question.optionB.trim().length < 5) {
    errors.push("Alternativa B muito curta.");
  }
  if (!question.optionC || question.optionC.trim().length < 5) {
    errors.push("Alternativa C muito curta.");
  }
  if (!question.optionD || question.optionD.trim().length < 5) {
    errors.push("Alternativa D muito curta.");
  }
  if (!["A", "B", "C", "D"].includes(question.correctAnswer)) {
    errors.push("Gabarito inválido — deve ser A, B, C ou D.");
  }

  return { isValid: errors.length === 0, errors };
}

export async function validateQuestion(
  question: GeneratedQuestion,
  descriptorCode: string,
  descriptorDescription: string
): Promise<ValidationResult> {
  // 1. Validação estrutural (rápida, sem LLM)
  const structureResult = validateStructure(question);
  if (!structureResult.isValid) {
    return structureResult;
  }

  // 2. Validação semântica com LLM leve (gpt-4o-mini)
  const prompt = buildValidationPrompt(question, descriptorCode, descriptorDescription);

  try {
    const response = await validatorLlm.invoke([{ role: "user", content: prompt }]);
    const raw = String(response.content).trim();
    const jsonStr = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonStr);

    return {
      isValid: Boolean(parsed.isValid),
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    };
  } catch {
    // Se o LLM falhar, aceitar a questão (a validação estrutural já passou)
    return { isValid: true, errors: [] };
  }
}
