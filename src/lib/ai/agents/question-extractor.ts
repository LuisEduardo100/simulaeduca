import OpenAI from "openai";

export interface ExtractedQuestion {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;   // "A"|"B"|"C"|"D" ou "" se não detectado
  descriptorCode: string;  // "D07" ou "" se não detectado
  difficulty: string;      // "facil"|"medio"|"dificil" ou "" se não detectado
}

const openai = new OpenAI();

const SYSTEM_PROMPT = `Você é um especialista em avaliações educacionais brasileiras (SPAECE, SAEB, BNCC, ENEM).

Analise o texto fornecido e extraia APENAS questões COMPLETAS de múltipla escolha.

Para cada questão identifique:
- stem: enunciado completo da questão, incluindo contexto textual (poemas, tabelas descritas em texto, textos base). Preserve o texto integral.
- optionA/B/C/D: conteúdo de cada alternativa, SEM a letra inicial — apenas o texto da alternativa.
- correctAnswer: letra da resposta correta (A, B, C ou D) somente se claramente indicada no texto (ex: "(gabarito: C)", asterisco, negrito descrito, etc.). Caso contrário retorne "".
- descriptorCode: código do descritor mencionado próximo à questão, como "D07", "D17", "D48". Caso contrário retorne "".
- difficulty: "facil", "medio" ou "dificil" somente se mencionada explicitamente ou claramente inferível pelo enunciado. Caso contrário retorne "".

REGRAS:
- IGNORE completamente: menus de navegação, botões, links ("Baixar", "Compartilhar"), rodapés, cabeçalhos do site, anúncios, comentários, textos publicitários.
- INCLUA apenas questões com enunciado de ao menos 20 caracteres e exatamente 4 alternativas identificáveis.
- Alternativas podem aparecer com letras (A/B/C/D), números (1/2/3/4) ou outros marcadores — normalize sempre para A/B/C/D.
- Se um texto de apoio (poema, tabela, notícia) precede várias questões, inclua-o no stem de cada questão que o referencie.

Retorne APENAS JSON válido no formato:
{"questions": [{"stem":"...","optionA":"...","optionB":"...","optionC":"...","optionD":"...","correctAnswer":"","descriptorCode":"","difficulty":""}]}`;

export async function extractQuestionsFromText(text: string): Promise<ExtractedQuestion[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  // Limitar a 40k chars para não exceder o contexto do modelo
  const trimmedText =
    text.length > 40000 ? text.slice(0, 40000) + "\n\n[texto truncado para análise]" : text;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Texto para análise:\n\n${trimmedText}` },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { questions?: unknown[] };
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];

  return rawQuestions
    .filter(
      (q): q is Record<string, unknown> =>
        typeof q === "object" &&
        q !== null &&
        typeof (q as Record<string, unknown>).stem === "string" &&
        ((q as Record<string, unknown>).stem as string).trim().length >= 20 &&
        ["optionA", "optionB", "optionC", "optionD"].every(
          (k) =>
            typeof (q as Record<string, unknown>)[k] === "string" &&
            ((q as Record<string, unknown>)[k] as string).trim().length > 0
        )
    )
    .map((q) => ({
      stem: (q.stem as string).trim(),
      optionA: (q.optionA as string).trim(),
      optionB: (q.optionB as string).trim(),
      optionC: (q.optionC as string).trim(),
      optionD: (q.optionD as string).trim(),
      correctAnswer: ["A", "B", "C", "D"].includes(q.correctAnswer as string)
        ? (q.correctAnswer as string)
        : "",
      descriptorCode:
        typeof q.descriptorCode === "string" ? q.descriptorCode.trim().toUpperCase() : "",
      difficulty: ["facil", "medio", "dificil"].includes(q.difficulty as string)
        ? (q.difficulty as string)
        : "",
    }));
}
