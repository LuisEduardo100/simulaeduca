// Tipos TypeScript globais do projeto SimulaEduca

export type Difficulty = "facil" | "medio" | "dificil";
export type ExamStatus = "draft" | "generating" | "completed" | "failed";
export type UserRole = "teacher" | "admin" | "coordinator";
export type PlanType = "free" | "basic" | "pro" | "school" | "secretaria";
export type CorrectAnswer = "A" | "B" | "C" | "D";

export interface GeneratedQuestion {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: CorrectAnswer;
  justification: string;
  difficulty: Difficulty;
  descriptorCode: string;
}
