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
      questionBankBreakdown,
      reuseStats,
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

      // Question bank detailed breakdown
      prisma.$queryRawUnsafe<{
        total: number;
        generated: number;
        extracted: number;
        validated: number;
        with_image: number;
        total_reuses: number;
        avg_quality: number;
        never_used: number;
      }[]>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE origin = 'generated')::int AS generated,
           COUNT(*) FILTER (WHERE origin = 'extracted')::int AS extracted,
           COUNT(*) FILTER (WHERE validated = true)::int AS validated,
           COUNT(*) FILTER (WHERE has_image = true)::int AS with_image,
           COALESCE(SUM(times_used), 0)::int AS total_reuses,
           ROUND(COALESCE(AVG(quality_score), 0)::numeric, 2)::float AS avg_quality,
           COUNT(*) FILTER (WHERE times_used = 0)::int AS never_used
         FROM question_bank
         WHERE flagged = false`
      ),

      // Reuse stats from exam_questions (generated vs reused)
      prisma.$queryRawUnsafe<{ source: string; count: number }[]>(
        `SELECT source, COUNT(*)::int AS count
         FROM exam_questions
         GROUP BY source`
      ),
    ]);

    const qbBreakdown = questionBankBreakdown[0] ?? {
      total: 0, generated: 0, extracted: 0, validated: 0,
      with_image: 0, total_reuses: 0, avg_quality: 0, never_used: 0,
    };

    return NextResponse.json({
      totalUsers,
      totalExams,
      totalQuestions,
      totalMaterialChunks,
      totalScrapedSources,
      totalQuestionBank,

      questionBankBreakdown: qbBreakdown,

      reuseStats: reuseStats.reduce((acc, row) => {
        acc[row.source] = row.count;
        return acc;
      }, {} as Record<string, number>),

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
