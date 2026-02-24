// Constantes globais do projeto SimulaEduca

export const APP_NAME = "SimulaEduca";
export const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export const CREDIT_COST = {
  GENERATE_QUESTION: 1,
  REGENERATE_QUESTION: 1,
  GENERATE_PDF: 0,
} as const;

export const DIFFICULTY_LABELS = {
  facil: "Fácil",
  medio: "Médio",
  dificil: "Difícil",
} as const;

export const EXAM_STATUS = {
  DRAFT: "draft",
  GENERATING: "generating",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
