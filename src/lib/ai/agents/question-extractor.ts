import OpenAI from "openai";
import type { ExtractedImage } from "@/lib/ai/rag/extractors";
import { saveQuestionImage } from "@/lib/utils/image-storage";

export interface ExtractedQuestion {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;   // "A"|"B"|"C"|"D" ou "" se não detectado
  descriptorCode: string;  // "D07" ou "" se não detectado
  difficulty: string;      // "facil"|"medio"|"dificil" ou "" se não detectado
  hasImage: boolean;
  imageDescription: string;
  imageUrl: string;        // caminho relativo da imagem salva (se houver)
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
- hasImage: true se a questão faz referência a uma figura, gráfico, tabela visual, imagem ou contém um marcador [__IMG_PLACEHOLDER_X__]. Caso contrário false.
- imageRef: se hasImage é true E existe um marcador [__IMG_PLACEHOLDER_X__] no enunciado ou contexto da questão, retorne o marcador exato (ex: "__IMG_PLACEHOLDER_0__"). Caso contrário retorne "".
- imageDescription: se hasImage é true, descreva brevemente o que a imagem/figura representa para a questão (ex: "Gráfico de barras com dados de temperatura mensal"). Caso contrário retorne "".

REGRAS:
- IGNORE completamente: menus de navegação, botões, links ("Baixar", "Compartilhar"), rodapés, cabeçalhos do site, anúncios, comentários, textos publicitários.
- INCLUA apenas questões com enunciado de ao menos 20 caracteres e exatamente 4 alternativas identificáveis.
- Alternativas podem aparecer com letras (A/B/C/D), números (1/2/3/4) ou outros marcadores — normalize sempre para A/B/C/D.
- Se um texto de apoio (poema, tabela, notícia) precede várias questões, inclua-o no stem de cada questão que o referencie.
- Marcadores [__IMG_PLACEHOLDER_X__] representam figuras/imagens do documento original. Mantenha-os no stem se fizerem parte do contexto da questão.

Retorne APENAS JSON válido no formato:
{"questions": [{"stem":"...","optionA":"...","optionB":"...","optionC":"...","optionD":"...","correctAnswer":"","descriptorCode":"","difficulty":"","hasImage":false,"imageRef":"","imageDescription":""}]}`;

// Padrões textuais que indicam presença de imagem/figura na questão
const IMAGE_HINT_PATTERNS = [
  /\bfigura\b/i,
  /\bgr[aá]fico\b/i,
  /\btabela\b/i,
  /\bimagem\b/i,
  /\bquadro\b/i,
  /\bilust?ra[cç][aã]o\b/i,
  /\bmapa\b/i,
  /\bdiagrama\b/i,
  /\bobserve\b/i,
  /\banalise a?\s*(figura|imagem|gr[aá]fico|tabela|quadro)/i,
  /\bde acordo com (a|o) (figura|gr[aá]fico|tabela|quadro|imagem)/i,
  /\[__IMG_PLACEHOLDER_\d+__\]/,
];

function detectsImageHint(text: string): boolean {
  return IMAGE_HINT_PATTERNS.some((p) => p.test(text));
}

/**
 * Strip option patterns from stem when the LLM includes them in the stem text.
 * This prevents duplicate options (once in stem, once in optionA/B/C/D fields).
 */
function stripOptionsFromStem(stem: string, optA: string, optB: string): string {
  // Pattern 1: Options on separate lines starting with A)/B)/C)/D) or (A)/(B)/(C)/(D)
  const newlinePattern = /\n\s*\(?A\)?\s*[\s\S]+$/;
  const match = stem.match(newlinePattern);
  if (match && match.index) {
    const candidate = stem.slice(0, match.index).trim();
    const cutPortion = match[0].toLowerCase();
    if (
      candidate.length >= 30 &&
      (cutPortion.includes(optA.toLowerCase().slice(0, 20)) ||
       cutPortion.includes(optB.toLowerCase().slice(0, 20)))
    ) {
      return candidate;
    }
  }

  // Pattern 2: Inline " A) text B) text C) text D) text" at end of stem
  const inlinePattern = /\s+\(?A\)?\s+[\s\S]+\(?B\)?\s+[\s\S]+\(?C\)?\s+[\s\S]+\(?D\)?\s+[\s\S]+$/;
  const match2 = stem.match(inlinePattern);
  if (match2 && match2.index) {
    const candidate = stem.slice(0, match2.index).trim();
    const cutPortion = match2[0].toLowerCase();
    if (
      candidate.length >= 30 &&
      (cutPortion.includes(optA.toLowerCase().slice(0, 20)) ||
       cutPortion.includes(optB.toLowerCase().slice(0, 20)))
    ) {
      return candidate;
    }
  }

  return stem;
}

function parseRawQuestions(rawQuestions: unknown[]): ExtractedQuestion[] {
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
    .map((q) => {
      const rawStem = (q.stem as string).trim();
      const optA = (q.optionA as string).trim();
      const optB = (q.optionB as string).trim();
      const stem = stripOptionsFromStem(rawStem, optA, optB);
      const hasImageFromModel = q.hasImage === true;
      const hasImageFromHint = detectsImageHint(stem);

      return {
        stem,
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
        hasImage: hasImageFromModel || hasImageFromHint,
        imageDescription: typeof q.imageDescription === "string" ? q.imageDescription.trim() : "",
        imageUrl: "",
      };
    });
}

// Max chars per LLM call (leaves room for system prompt tokens)
const CHUNK_SIZE = 38000;
// Overlap between chunks to avoid splitting questions at boundaries
const CHUNK_OVERLAP = 3000;

/**
 * Split text into overlapping chunks for processing.
 * Tries to split at paragraph boundaries to avoid cutting mid-question.
 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    // Try to find a paragraph break near the end to avoid splitting mid-question
    if (end < text.length) {
      const searchStart = Math.max(end - 2000, start + CHUNK_SIZE / 2);
      const region = text.slice(searchStart, end);
      // Look for double newline (paragraph break) or "Questão" / question number pattern
      const breakPatterns = [/\n\n(?=\d{1,3}\s*[).–—])/g, /\n\n/g, /\n/g];
      for (const pattern of breakPatterns) {
        let lastMatch = -1;
        let m;
        while ((m = pattern.exec(region)) !== null) {
          lastMatch = m.index;
        }
        if (lastMatch >= 0) {
          end = searchStart + lastMatch + 1;
          break;
        }
      }
    }

    chunks.push(text.slice(start, end));
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }

  return chunks;
}

/**
 * Dedup questions across chunks by comparing stem similarity.
 * Uses simple prefix matching (first 80 chars) — cheaper than embeddings.
 */
function deduplicateQuestions(questions: ExtractedQuestion[]): ExtractedQuestion[] {
  const seen = new Set<string>();
  const result: ExtractedQuestion[] = [];

  for (const q of questions) {
    // Normalize: lowercase, collapse whitespace, take first 80 chars
    const key = q.stem.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(q);
    }
  }

  return result;
}

/**
 * Extract questions from a single chunk of text.
 */
async function extractQuestionsFromChunk(chunk: string, chunkIndex: number, totalChunks: number): Promise<ExtractedQuestion[]> {
  const chunkLabel = totalChunks > 1
    ? `\n\n[Parte ${chunkIndex + 1} de ${totalChunks} — pode haver continuação em outras partes]`
    : "";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Texto para análise:${chunkLabel}\n\n${chunk}` },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { questions?: unknown[] };
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];

  return parseRawQuestions(rawQuestions);
}

/**
 * Extrai questões de texto, processando em chunks se necessário.
 * Para textos >40KB, divide em partes com overlap e combina resultados.
 */
export async function extractQuestionsFromText(text: string): Promise<ExtractedQuestion[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const chunks = splitTextIntoChunks(text);

  if (chunks.length === 1) {
    // Single chunk — simple path
    return extractQuestionsFromChunk(chunks[0], 0, 1);
  }

  // Multiple chunks — process in parallel (max 3 concurrent to respect rate limits)
  console.log(`[question-extractor] Texto grande (${text.length} chars) — processando ${chunks.length} chunks`);

  const EXTRACT_CONCURRENCY = 3;
  const allQuestions: ExtractedQuestion[] = [];
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < chunks.length; i++) {
    const chunkIdx = i;
    const task = (async () => {
      try {
        const questions = await extractQuestionsFromChunk(chunks[chunkIdx], chunkIdx, chunks.length);
        allQuestions.push(...questions);
      } catch (err) {
        console.warn(`[question-extractor] Chunk ${chunkIdx + 1}/${chunks.length} falhou:`, err instanceof Error ? err.message : err);
      }
    })().finally(() => executing.delete(task));

    executing.add(task);

    if (executing.size >= EXTRACT_CONCURRENCY) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);

  // Deduplicate questions from overlapping regions
  const deduped = deduplicateQuestions(allQuestions);
  console.log(`[question-extractor] ${allQuestions.length} questões brutas → ${deduped.length} após dedup`);

  return deduped;
}

/**
 * Pós-processamento: para questões com placeholders [__IMG_PLACEHOLDER_X__],
 * salva as imagens no storage e atualiza imageUrl.
 * Substitui placeholders no stem por descrição legível.
 */
export async function processImagePlaceholders(
  questions: ExtractedQuestion[],
  images: ExtractedImage[]
): Promise<ExtractedQuestion[]> {
  const placeholderRegex = /\[?__IMG_PLACEHOLDER_(\d+)__\]?/g;

  for (const q of questions) {
    const matches = [...q.stem.matchAll(placeholderRegex)];
    if (matches.length === 0) continue;

    // Pegar o primeiro placeholder (uma imagem por questão no MVP)
    const match = matches[0];
    const imgIdx = parseInt(match[1], 10);

    if (imgIdx >= 0 && imgIdx < images.length) {
      const img = images[imgIdx];
      try {
        const savedPath = await saveQuestionImage(img.base64, img.contentType);
        q.imageUrl = savedPath;
        q.hasImage = true;

        // Substituir todos os placeholders desta questão por descrição
        const desc = q.imageDescription || "Figura";
        q.stem = q.stem.replace(placeholderRegex, `[${desc}]`);
      } catch (err) {
        console.warn(`[processImagePlaceholders] Falha ao salvar imagem ${imgIdx}:`, err);
      }
    }
  }

  return questions;
}
