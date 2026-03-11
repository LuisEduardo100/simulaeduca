// Tipos TypeScript globais do projeto SimulaEduca

export type Difficulty = "facil" | "medio" | "dificil";
export type DifficultyOrMixed = Difficulty | "misto";
export type ExamStatus = "draft" | "generating" | "completed" | "failed" | "partial";
export type UserRole = "teacher" | "admin" | "coordinator";
export type PlanType = "free" | "basic" | "pro" | "school" | "secretaria";
export type CorrectAnswer = "A" | "B" | "C" | "D";
export type HeaderMode = "standard" | "custom" | "none";

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
  hasImage?: boolean;
  imageDescription?: string;
  imageUrl?: string;
}

export type ColumnLayout = 1 | 2;

export interface HeaderConfig {
  mode: HeaderMode;
  columns?: ColumnLayout; // 1 coluna (padrão) ou 2 colunas para economizar papel
  imageBase64?: string; // base64 da imagem de cabeçalho personalizado
  imageMimeType?: string; // "image/png" | "image/jpeg"
  teacherName?: string;
  school?: string;
  discipline?: string;
  className?: string; // turma
  examDate?: string;
}

export interface DescriptorDistribution {
  descriptorId: number;
  descriptorCode: string;
  descriptorDescription: string;
  questionCount: number;
}

export interface GenerationProgressData {
  examId: string;
  status: ExamStatus;
  totalExpected: number;
  totalGenerated: number;
  questions: {
    questionNumber: number;
    descriptorCode: string;
    status: "completed" | "error";
  }[];
}
