import { auth } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

interface CoverageRow {
  descriptor_id: number;
  code: string;
  description: string;
  theme_name: string;
  roman_numeral: string | null;
  subject_name: string;
  subject_slug: string;
  grade_level_name: string;
  grade_level_slug: string;
  evaluation_name: string;
  chunk_count: number;
  question_bank_count: number;
  questions_generated: number;
}

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

    const rows = await prisma.$queryRawUnsafe<CoverageRow[]>(`
      SELECT
        d.id AS descriptor_id,
        d.code,
        d.description,
        t.name AS theme_name,
        t.roman_numeral,
        s.name AS subject_name,
        s.slug AS subject_slug,
        gl.name AS grade_level_name,
        gl.slug AS grade_level_slug,
        e.name AS evaluation_name,
        COALESCE(mc.chunk_count, 0)::int AS chunk_count,
        COALESCE(qb.question_bank_count, 0)::int AS question_bank_count,
        COALESCE(eq.questions_generated, 0)::int AS questions_generated
      FROM descriptors d
      JOIN themes t ON t.id = d.theme_id
      JOIN subjects s ON s.id = d.subject_id
      JOIN grade_levels gl ON gl.id = d.grade_level_id
      JOIN evaluations e ON e.id = d.evaluation_id
      LEFT JOIN (
        SELECT descriptor_code, COUNT(*)::int AS chunk_count
        FROM material_chunks
        WHERE embedding IS NOT NULL AND descriptor_code IS NOT NULL
        GROUP BY descriptor_code
      ) mc ON mc.descriptor_code = d.code
      LEFT JOIN (
        SELECT descriptor_id, COUNT(*)::int AS question_bank_count
        FROM question_bank
        GROUP BY descriptor_id
      ) qb ON qb.descriptor_id = d.id
      LEFT JOIN (
        SELECT descriptor_id, COUNT(*)::int AS questions_generated
        FROM exam_questions
        GROUP BY descriptor_id
      ) eq ON eq.descriptor_id = d.id
      ORDER BY e.name, s.name, gl.slug, t.roman_numeral NULLS LAST, d.code
    `);

    const totalDescriptors = rows.length;
    const withCoverage = rows.filter((r) => r.chunk_count > 0).length;
    const withoutCoverage = totalDescriptors - withCoverage;
    const totalChunks = rows.reduce((sum, r) => sum + r.chunk_count, 0);

    return NextResponse.json({
      summary: {
        totalDescriptors,
        withCoverage,
        withoutCoverage,
        coveragePercent:
          totalDescriptors > 0
            ? Math.round((withCoverage / totalDescriptors) * 100)
            : 0,
        totalChunks,
      },
      descriptors: rows.map((r) => ({
        id: r.descriptor_id,
        code: r.code,
        description: r.description,
        themeName: r.theme_name,
        romanNumeral: r.roman_numeral,
        subjectName: r.subject_name,
        subjectSlug: r.subject_slug,
        gradeLevelName: r.grade_level_name,
        gradeLevelSlug: r.grade_level_slug,
        evaluationName: r.evaluation_name,
        chunkCount: r.chunk_count,
        questionBankCount: r.question_bank_count,
        questionsGenerated: r.questions_generated,
      })),
    });
  } catch (error) {
    console.error("[admin/descriptor-coverage] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar cobertura" },
      { status: 500 }
    );
  }
}
