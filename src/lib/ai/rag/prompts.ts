import type { RetrievedChunk } from "./retriever";
import type { GeneratedQuestion } from "@/types";

export function buildQuestionGenerationPrompt(params: {
  descriptorCode: string;
  descriptorDescription: string;
  gradeLevel: string;
  subject: string;
  relevantChunks: RetrievedChunk[];
}): string {
  const { descriptorCode, descriptorDescription, gradeLevel, subject, relevantChunks } = params;

  const context =
    relevantChunks.length > 0
      ? relevantChunks
          .map((chunk, i) => `--- Exemplo ${i + 1} ---\n${chunk.content}`)
          .join("\n\n")
      : "Nenhum exemplo disponível na base de conhecimento para este descritor.";

  return `Você é um especialista em elaboração de itens de avaliação educacional para o SPAECE e SAEB, com foco em ${subject}.

DESCRITOR: ${descriptorCode} — ${descriptorDescription}
SÉRIE: ${gradeLevel}
DISCIPLINA: ${subject}

EXEMPLOS DE MATERIAIS DE REFERÊNCIA (contexto RAG):
${context}

INSTRUÇÕES OBRIGATÓRIAS:
1. Crie UMA questão de múltipla escolha com 4 alternativas (A, B, C, D)
2. Apenas UMA alternativa deve estar correta
3. Os distratores (alternativas erradas) devem representar erros comuns dos alunos dessa série — erros de raciocínio plausíveis, não respostas absurdas
4. O enunciado deve ser contextualizado em situações do cotidiano do aluno
5. A linguagem deve ser adequada para alunos do ${gradeLevel} — clara, objetiva e sem ambiguidade
6. Se necessário, descreva figuras ou gráficos em formato textual entre colchetes, ex: [Figura: tabela com dados de temperatura]
7. A questão deve avaliar EXATAMENTE a habilidade descrita no descritor ${descriptorCode}
8. Não repita questões já presentes nos exemplos — crie uma questão INÉDITA

FORMATO DE RESPOSTA (retorne APENAS o JSON, sem texto adicional):
{
  "stem": "Enunciado completo da questão aqui...",
  "optionA": "Primeira alternativa",
  "optionB": "Segunda alternativa",
  "optionC": "Terceira alternativa",
  "optionD": "Quarta alternativa",
  "correctAnswer": "A",
  "justification": "Explicação detalhada de por que a alternativa correta é correta e por que os distratores estão errados",
  "difficulty": "medio"
}`;
}

export function buildValidationPrompt(
  question: GeneratedQuestion,
  descriptorCode: string,
  descriptorDescription: string
): string {
  return `Você é um especialista em avaliação educacional. Analise a questão abaixo e verifique se está correta.

DESCRITOR ALVO: ${descriptorCode} — ${descriptorDescription}

QUESTÃO:
Enunciado: ${question.stem}
A) ${question.optionA}
B) ${question.optionB}
C) ${question.optionC}
D) ${question.optionD}
Gabarito: ${question.correctAnswer}
Justificativa: ${question.justification}

VERIFIQUE:
1. A alternativa indicada como gabarito (${question.correctAnswer}) está matematicamente/gramaticalmente CORRETA?
2. As demais alternativas estão INCORRETAS?
3. A questão avalia a habilidade do descritor ${descriptorCode}?
4. Os distratores são plausíveis (erros comuns), não absurdos?

Responda APENAS com JSON:
{
  "isValid": true,
  "errors": []
}
ou
{
  "isValid": false,
  "errors": ["Descrição do erro 1", "Descrição do erro 2"]
}`;
}
