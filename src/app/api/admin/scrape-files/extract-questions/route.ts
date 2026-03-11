import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { rateLimitOrNull } from "@/lib/cache/rate-limiter";
import {
  extractFromPdf,
  extractFromDocxWithImages,
  extractFromTxt,
} from "@/lib/ai/rag/extractors";
import {
  extractQuestionsFromText,
  processImagePlaceholders,
} from "@/lib/ai/agents/question-extractor";
import { prisma } from "@/lib/db/prisma";

/**
 * Parsea uma string de gabarito "1-A, 2-C, 3-B, ..." em um mapa { 1: "A", 2: "C", ... }
 */
function parseAnswerKeyString(answerKey: string): Record<number, string> {
  const result: Record<number, string> = {};
  const pairRegex = /(\d{1,3})\s*[).\-–—:]\s*([A-Da-d])\b/g;
  let m;
  while ((m = pairRegex.exec(answerKey)) !== null) {
    const num = parseInt(m[1], 10);
    const letter = m[2].toUpperCase();
    if (num > 0 && num <= 100) {
      result[num] = letter;
    }
  }
  return result;
}

const schema = z.object({
  url: z.string().url(),
  filename: z.string().min(1),
  type: z.enum(["pdf", "docx", "txt"]),
  sourceId: z.string().uuid().optional(), // ID do ScrapedSource (do batch)
  answerKey: z.string().optional(), // gabarito da página, ex: "1-A, 2-C, 3-B"
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const rl = await rateLimitOrNull(session.user.id, "extraction");
    if (rl) {
      return NextResponse.json({ error: rl.error }, { status: rl.status, headers: rl.headers });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { url, filename, type, sourceId, answerKey } = parsed.data;

    // Se tem sourceId, verificar cache — se já extraído/ingerido, retornar dados cacheados
    if (sourceId) {
      const existing = await prisma.scrapedSource.findUnique({
        where: { id: sourceId },
      });

      if (
        existing &&
        (existing.status === "extracted" || existing.status === "ingested") &&
        existing.extractedData
      ) {
        const cachedQuestions = existing.extractedData as unknown[];
        return NextResponse.json({
          questions: cachedQuestions,
          total: cachedQuestions.length,
          filename: existing.fileName,
          textLength: 0,
          wasTruncated: false,
          sourceId: existing.id,
          cached: true,
        });
      }

      // Marcar como extracting
      await prisma.scrapedSource.update({
        where: { id: sourceId },
        data: { status: "extracting" },
      }).catch(() => {}); // não bloquear se falhar
    }

    // Download do arquivo com timeout de 30s
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SimulaEduca/1.0)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (sourceId) {
        await prisma.scrapedSource.update({
          where: { id: sourceId },
          data: { status: "failed", errorMessage: `HTTP ${response.status}` },
        }).catch(() => {});
      }
      return NextResponse.json(
        { error: `Falha ao baixar arquivo: HTTP ${response.status}` },
        { status: 400 }
      );
    }

    // Validar tamanho do arquivo antes de baixar (previne consumo de memória excessivo)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_FILE_SIZE) {
      if (sourceId) {
        await prisma.scrapedSource.update({
          where: { id: sourceId },
          data: { status: "failed", errorMessage: `Arquivo muito grande: ${(contentLength / 1024 / 1024).toFixed(1)}MB (máx 50MB)` },
        }).catch(() => {});
      }
      return NextResponse.json(
        { error: `Arquivo muito grande (${(contentLength / 1024 / 1024).toFixed(1)}MB). Máximo: 50MB.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Validar tamanho real do buffer (Content-Length pode estar ausente ou errado)
    if (buffer.length > MAX_FILE_SIZE) {
      if (sourceId) {
        await prisma.scrapedSource.update({
          where: { id: sourceId },
          data: { status: "failed", errorMessage: `Arquivo muito grande: ${(buffer.length / 1024 / 1024).toFixed(1)}MB` },
        }).catch(() => {});
      }
      return NextResponse.json(
        { error: `Arquivo muito grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Máximo: 50MB.` },
        { status: 400 }
      );
    }

    // Salvar arquivo original para rastreio
    const storageDir = path.join(process.cwd(), "storage", "provas-scraped");
    await mkdir(storageDir, { recursive: true });
    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._\-\u00C0-\u017E]/g, "_");
    const storedFileName = `${timestamp}_${safeName}`;
    const storedPath = path.join(storageDir, storedFileName);

    try {
      await writeFile(storedPath, buffer);
    } catch (saveErr) {
      console.warn(`[extract-questions] Falha ao salvar ${filename}:`, saveErr);
    }

    // Atualizar com file info
    if (sourceId) {
      await prisma.scrapedSource.update({
        where: { id: sourceId },
        data: {
          storedPath: path.relative(process.cwd(), storedPath),
          fileSize: buffer.length,
        },
      }).catch(() => {});
    }

    // Extrair texto (e imagens para DOCX)
    let text: string;
    let questions;

    if (type === "docx") {
      // DOCX: extrair texto + imagens com mammoth
      const { text: docxText, images } = await extractFromDocxWithImages(buffer);
      text = docxText;

      if (!text.trim()) {
        if (sourceId) {
          await prisma.scrapedSource.update({
            where: { id: sourceId },
            data: { status: "failed", errorMessage: "Arquivo sem conteúdo textual." },
          }).catch(() => {});
        }
        return NextResponse.json(
          { error: "Nao foi possivel extrair texto do arquivo." },
          { status: 400 }
        );
      }

      // Extrair questões com GPT-4o (texto inclui placeholders de imagem)
      questions = await extractQuestionsFromText(text);

      // Pós-processar: salvar imagens e associar com questões
      if (images.length > 0) {
        questions = await processImagePlaceholders(questions, images);
      }
    } else {
      // PDF e TXT: extração de texto apenas
      if (type === "pdf") {
        text = await extractFromPdf(buffer);
      } else {
        text = await extractFromTxt(buffer);
      }

      if (!text.trim()) {
        if (sourceId) {
          await prisma.scrapedSource.update({
            where: { id: sourceId },
            data: { status: "failed", errorMessage: "Arquivo sem conteúdo textual." },
          }).catch(() => {});
        }
        return NextResponse.json(
          { error: "Nao foi possivel extrair texto do arquivo." },
          { status: 400 }
        );
      }

      questions = await extractQuestionsFromText(text);
    }

    const textLength = text.length;
    const wasTruncated = textLength > 40000;

    // Aplicar gabarito da página (se disponível) para preencher correctAnswer faltante
    let answerKeyApplied = 0;
    if (answerKey) {
      const parsedKey = parseAnswerKeyString(answerKey);
      for (let i = 0; i < questions.length; i++) {
        const qNum = i + 1;
        if (!questions[i].correctAnswer && parsedKey[qNum]) {
          questions[i].correctAnswer = parsedKey[qNum];
          answerKeyApplied++;
        }
      }
    }

    // Persistir questões extraídas no ScrapedSource
    if (sourceId) {
      await prisma.scrapedSource.update({
        where: { id: sourceId },
        data: {
          status: "extracted",
          questionsFound: questions.length,
          extractedData: questions as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      questions,
      total: questions.length,
      filename,
      textLength,
      wasTruncated,
      sourceId: sourceId ?? null,
      answerKeyApplied,
    });
  } catch (error) {
    console.error("[scrape-files/extract-questions] Erro:", error);

    // Tentar marcar como failed se temos sourceId
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.sourceId) {
        await prisma.scrapedSource.update({
          where: { id: body.sourceId },
          data: {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
          },
        }).catch(() => {});
      }
    } catch {
      // ignore
    }

    return NextResponse.json(
      { error: "Erro interno ao processar arquivo." },
      { status: 500 }
    );
  }
}
