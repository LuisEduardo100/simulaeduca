import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/admin/scrape-files/batch/[batchId] — status do batch
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const { batchId } = await params;

  const sources = await prisma.scrapedSource.findMany({
    where: { batchId },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      fileType: true,
      status: true,
      questionsFound: true,
      questionsIngested: true,
      errorMessage: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (sources.length === 0) {
    return NextResponse.json({ error: "Batch não encontrado." }, { status: 404 });
  }

  const summary = {
    total: sources.length,
    pending: sources.filter((s) => s.status === "pending").length,
    processing: sources.filter((s) => s.status === "extracting").length,
    extracted: sources.filter((s) => s.status === "extracted").length,
    ingested: sources.filter((s) => s.status === "ingested").length,
    failed: sources.filter((s) => s.status === "failed").length,
    totalQuestionsFound: sources.reduce((acc, s) => acc + s.questionsFound, 0),
  };

  return NextResponse.json({ batchId, files: sources, summary });
}
