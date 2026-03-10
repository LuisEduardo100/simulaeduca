import { auth } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    if (session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Acesso negado" },
        { status: 403 }
      );
    }

    const [
      totalUsers,
      totalExams,
      totalQuestions,
      totalMaterialChunks,
      totalScrapedSources,
      totalQuestionBank,
      examsByStatus,
      questionsPerDay,
      recentExams,
      topDescriptors,
    ] = await Promise.all([
      // Overview counts
      prisma.user.count(),
      prisma.exam.count(),
      prisma.examQuestion.count(),
      prisma.materialChunk.count(),
      prisma.scrapedSource.count(),
      prisma.questionBank.count(),

      // Exams grouped by status
      prisma.exam.groupBy({
        by: ["status"],
        _count: { status: true },
      }),

      // Questions generated per day (last 30 days)
      prisma.$queryRawUnsafe<{ date: string; count: number }[]>(
        `SELECT DATE(created_at)::text as date, COUNT(*)::int as count
         FROM exam_questions
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY date`
      ),

      // Recent exams with user name
      prisma.exam.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          user: {
            select: { name: true },
          },
        },
      }),

      // Top 10 descriptors by usage in exam_questions
      prisma.$queryRawUnsafe<
        { code: string; description: string; count: number }[]
      >(
        `SELECT d.code, d.description, COUNT(*)::int as count
         FROM exam_questions eq
         JOIN descriptors d ON d.id = eq.descriptor_id
         GROUP BY d.id, d.code, d.description
         ORDER BY count DESC
         LIMIT 10`
      ),
    ]);

    return NextResponse.json({
      totalUsers,
      totalExams,
      totalQuestions,
      totalMaterialChunks,
      totalScrapedSources,
      totalQuestionBank,

      examsByStatus: examsByStatus.map((row) => ({
        status: row.status,
        count: row._count.status,
      })),

      questionsPerDay,

      recentExams: recentExams.map((exam) => ({
        id: exam.id,
        title: exam.title,
        status: exam.status,
        createdAt: exam.createdAt.toISOString(),
        userName: exam.user.name ?? "Sem nome",
      })),

      topDescriptors,
    });
  } catch (error) {
    console.error("[admin/stats] Erro ao buscar estatísticas:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar estatísticas" },
      { status: 500 }
    );
  }
}
