import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { extractFromPdf, extractFromDocx, extractFromTxt } from "@/lib/ai/rag/extractors";
import { ingestMaterial } from "@/lib/ai/rag/ingest";
import { prisma } from "@/lib/db/prisma";

const fileSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1),
  type: z.enum(["pdf", "docx", "txt"]),
});

const schema = z.object({
  pageUrl: z.string().url(),
  files: z.array(fileSchema).min(1).max(20),
  metadata: z.object({
    descriptorCode: z.string().optional(),
    subjectSlug: z.string().optional(),
    gradeLevelSlug: z.string().optional(),
    evaluationSlug: z.string().optional(),
    difficulty: z.string().optional(),
  }),
});

export interface IngestFileResult {
  url: string;
  filename: string;
  status: "success" | "error";
  chunksCreated?: number;
  error?: string;
  fileSize?: number;
}

// POST /api/admin/scrape-files/ingest — baixar, extrair e ingerir arquivos selecionados
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { pageUrl, files, metadata } = parsed.data;
  const results: IngestFileResult[] = [];

  // Diretório de armazenamento para rastreio
  const storageDir = path.join(process.cwd(), "storage", "provas-scraped");
  await mkdir(storageDir, { recursive: true });

  for (const file of files) {
    try {
      // 1. Baixar o arquivo
      const response = await fetch(file.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SimulaEduca/1.0)",
          Accept: "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        results.push({
          url: file.url,
          filename: file.filename,
          status: "error",
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileSize = buffer.length;

      // 2. Salvar arquivo original para rastreio
      const timestamp = Date.now();
      const safeName = file.filename.replace(/[^a-zA-Z0-9._\-\u00C0-\u017E]/g, "_");
      const storedFileName = `${timestamp}_${safeName}`;
      const storedPath = path.join(storageDir, storedFileName);

      try {
        await writeFile(storedPath, buffer);
      } catch (saveErr) {
        console.warn(`[scrape-files] Falha ao salvar ${file.filename}:`, saveErr);
      }

      // 3. Extrair texto
      let content = "";
      try {
        if (file.type === "pdf") {
          content = await extractFromPdf(buffer);
        } else if (file.type === "docx") {
          content = await extractFromDocx(buffer);
        } else {
          content = await extractFromTxt(buffer);
        }
      } catch (extractErr) {
        results.push({
          url: file.url,
          filename: file.filename,
          status: "error",
          fileSize,
          error: `Erro ao extrair texto: ${extractErr instanceof Error ? extractErr.message : "desconhecido"}`,
        });
        continue;
      }

      if (!content.trim()) {
        results.push({
          url: file.url,
          filename: file.filename,
          status: "error",
          fileSize,
          error: "Arquivo sem conteúdo textual extraível.",
        });
        continue;
      }

      // 4. Ingerir no RAG (chunking + embeddings + pgvector)
      const ingestResult = await ingestMaterial({
        content,
        sourceType: file.type,
        sourceFileName: file.filename,
        metadata: {
          descriptorCode: metadata.descriptorCode,
          subjectSlug: metadata.subjectSlug,
          gradeLevelSlug: metadata.gradeLevelSlug,
          evaluationSlug: metadata.evaluationSlug,
          difficulty: metadata.difficulty,
        },
        uploadedBy: session.user.id,
      });

      // 5. Registrar na tabela scraped_sources para rastreio
      await prisma.scrapedSource.create({
        data: {
          pageUrl,
          fileName: file.filename,
          fileUrl: file.url,
          fileType: file.type,
          fileSize,
          storedPath: path.relative(process.cwd(), storedPath),
          chunksCreated: ingestResult.chunksCreated,
          descriptorCode: metadata.descriptorCode ?? null,
          subjectSlug: metadata.subjectSlug ?? null,
          gradeLevelSlug: metadata.gradeLevelSlug ?? null,
          evaluationSlug: metadata.evaluationSlug ?? null,
          difficulty: metadata.difficulty ?? null,
          scrapedBy: session.user.id,
        },
      });

      results.push({
        url: file.url,
        filename: file.filename,
        status: "success",
        chunksCreated: ingestResult.chunksCreated,
        fileSize,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      results.push({
        url: file.url,
        filename: file.filename,
        status: "error",
        error: message.includes("timeout") ? "Timeout ao baixar arquivo (30s)." : message,
      });
    }
  }

  const success = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;
  const totalChunks = results.reduce((acc, r) => acc + (r.chunksCreated ?? 0), 0);

  return NextResponse.json({ results, summary: { success, failed, totalChunks } });
}
