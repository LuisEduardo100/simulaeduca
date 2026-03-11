import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "crypto";

const fileSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1),
  type: z.enum(["pdf", "docx", "txt"]),
});

const schema = z.object({
  pageUrl: z.string().url(),
  files: z.array(fileSchema).min(1).max(200),
  metadata: z.object({
    subjectSlug: z.string().optional(),
    gradeLevelSlug: z.string().optional(),
    evaluationSlug: z.string().optional(),
  }),
});

export interface BatchFileStatus {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  status: string;
  questionsFound: number;
  questionsIngested: number;
  errorMessage: string | null;
  alreadyDone: boolean;
}

// POST /api/admin/scrape-files/batch — criar batch de extração inteligente
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
  const batchId = randomUUID();
  const results: BatchFileStatus[] = [];
  let alreadyDoneCount = 0;

  for (const file of files) {
    // Verificar se já existe registro para esta URL + modo smart
    const existing = await prisma.scrapedSource.findUnique({
      where: {
        fileUrl_extractionMode: {
          fileUrl: file.url,
          extractionMode: "smart",
        },
      },
    });

    if (existing) {
      if (existing.status === "ingested") {
        // Já processado e ingerido — apenas informar
        alreadyDoneCount++;
        results.push({
          id: existing.id,
          fileName: existing.fileName,
          fileUrl: existing.fileUrl,
          fileType: existing.fileType,
          status: existing.status,
          questionsFound: existing.questionsFound,
          questionsIngested: existing.questionsIngested,
          errorMessage: null,
          alreadyDone: true,
        });
      } else if (existing.status === "extracted") {
        // Questões extraídas mas não ingeridas — resumable
        await prisma.scrapedSource.update({
          where: { id: existing.id },
          data: { batchId },
        });
        results.push({
          id: existing.id,
          fileName: existing.fileName,
          fileUrl: existing.fileUrl,
          fileType: existing.fileType,
          status: existing.status,
          questionsFound: existing.questionsFound,
          questionsIngested: existing.questionsIngested,
          errorMessage: null,
          alreadyDone: false,
        });
      } else if (existing.status === "failed") {
        // Falhou — resetar para pending
        const updated = await prisma.scrapedSource.update({
          where: { id: existing.id },
          data: {
            batchId,
            status: "pending",
            errorMessage: null,
            extractedData: undefined,
            questionsFound: 0,
          },
        });
        results.push({
          id: updated.id,
          fileName: updated.fileName,
          fileUrl: updated.fileUrl,
          fileType: updated.fileType,
          status: "pending",
          questionsFound: 0,
          questionsIngested: 0,
          errorMessage: null,
          alreadyDone: false,
        });
      } else {
        // pending / extracting — atualizar batchId
        await prisma.scrapedSource.update({
          where: { id: existing.id },
          data: { batchId },
        });
        results.push({
          id: existing.id,
          fileName: existing.fileName,
          fileUrl: existing.fileUrl,
          fileType: existing.fileType,
          status: existing.status,
          questionsFound: existing.questionsFound,
          questionsIngested: existing.questionsIngested,
          errorMessage: existing.errorMessage,
          alreadyDone: false,
        });
      }
    } else {
      // Criar novo registro
      const created = await prisma.scrapedSource.create({
        data: {
          pageUrl,
          fileName: file.filename,
          fileUrl: file.url,
          fileType: file.type,
          extractionMode: "smart",
          status: "pending",
          batchId,
          subjectSlug: metadata.subjectSlug ?? null,
          gradeLevelSlug: metadata.gradeLevelSlug ?? null,
          evaluationSlug: metadata.evaluationSlug ?? null,
          scrapedBy: session.user.id,
        },
      });
      results.push({
        id: created.id,
        fileName: created.fileName,
        fileUrl: created.fileUrl,
        fileType: created.fileType,
        status: "pending",
        questionsFound: 0,
        questionsIngested: 0,
        errorMessage: null,
        alreadyDone: false,
      });
    }
  }

  const pendingCount = results.filter((r) => !r.alreadyDone && r.status !== "extracted").length;

  return NextResponse.json({
    batchId,
    files: results,
    alreadyDoneCount,
    pendingCount,
    totalFiles: results.length,
  });
}
