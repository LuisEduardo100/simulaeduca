import type { RetrievedChunk } from "./retriever";
import type { GeneratedQuestion } from "@/types";

export function buildQuestionGenerationPrompt(params: {
  descriptorCode: string;
  descriptorDescription: string;
  gradeLevel: string;
  subject: string;
  difficulty?: string;
  relevantChunks: RetrievedChunk[];
  existingQuestions?: { stem: string; correctAnswer: string }[];
}): string {
  const { descriptorCode, descriptorDescription, gradeLevel, subject, difficulty, relevantChunks, existingQuestions } = params;

  const context =
    relevantChunks.length > 0
      ? relevantChunks
          .map((chunk, i) => `--- Exemplo ${i + 1} ---\n${chunk.content}`)
          .join("\n\n")
      : "Nenhum exemplo disponível na base de conhecimento para este descritor.";

  const difficultyLabel = difficulty === "facil" ? "FÁCIL" : difficulty === "dificil" ? "DIFÍCIL" : "MÉDIO";
  const difficultyGuidelines = difficulty === "facil"
    ? `- Use situações simples e diretas, com números pequenos e poucos passos de resolução
- Evite informações desnecessárias ou pegadinhas
- Os distratores devem representar erros básicos (ex: operação errada, leitura equivocada)`
    : difficulty === "dificil"
    ? `- Use situações que exijam múltiplos passos de raciocínio ou interpretação
- Inclua informações complementares que o aluno precisa filtrar
- Os distratores devem representar erros sofisticados (ex: aplicar apenas parte do procedimento, confundir conceitos próximos)`
    : `- Use situações com complexidade moderada, exigindo 2-3 passos de raciocínio
- Os distratores devem representar erros comuns plausíveis dessa série`;

  return `Você é um especialista em elaboração de itens de avaliação educacional para o SPAECE e SAEB, com foco em ${subject}.

DESCRITOR: ${descriptorCode} — ${descriptorDescription}
SÉRIE: ${gradeLevel}
DISCIPLINA: ${subject}
DIFICULDADE: ${difficultyLabel}

DIRETRIZES DE DIFICULDADE (${difficultyLabel}):
${difficultyGuidelines}

EXEMPLOS DE MATERIAIS DE REFERÊNCIA (contexto RAG):
${context}
${existingQuestions && existingQuestions.length > 0 ? `
QUESTÕES JÁ EXISTENTES NO BANCO (NÃO REPITA estes padrões — crie algo DIFERENTE):
${existingQuestions.map((eq, i) => `${i + 1}. "${eq.stem.slice(0, 150)}${eq.stem.length > 150 ? "..." : ""}" (Gab: ${eq.correctAnswer})`).join("\n")}
` : ""}
INSTRUÇÕES OBRIGATÓRIAS:
1. Crie UMA questão de múltipla escolha com 4 alternativas (A, B, C, D)
2. Apenas UMA alternativa deve estar correta — sem ambiguidade
3. Os distratores (alternativas erradas) devem representar erros comuns dos alunos dessa série — erros de raciocínio plausíveis, não respostas absurdas
4. O enunciado deve ser contextualizado em situações do cotidiano do aluno
5. A linguagem deve ser adequada para alunos do ${gradeLevel} — clara, objetiva e sem ambiguidade
6. Se a questão envolver dados tabulares, use tabela em formato Markdown no enunciado:
| Coluna1 | Coluna2 |
|---------|---------|
| dado1   | dado2   |
Para figuras não-tabulares (gráficos, mapas, ilustrações), descreva entre colchetes: [Figura: descrição da imagem]
7. A questão deve avaliar EXATAMENTE a habilidade descrita no descritor ${descriptorCode}
8. Não repita questões já presentes nos exemplos — crie uma questão INÉDITA
9. A dificuldade DEVE ser "${difficulty || "medio"}" conforme as diretrizes acima

Responda APENAS com JSON:
{
  "stem": "Enunciado completo da questão aqui...",
  "optionA": "Primeira alternativa",
  "optionB": "Segunda alternativa",
  "optionC": "Terceira alternativa",
  "optionD": "Quarta alternativa",
  "correctAnswer": "A",
  "justification": "Explicação detalhada de por que a alternativa correta é correta e por que os distratores estão errados",
  "difficulty": "${difficulty || "medio"}"
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
