import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/simulados — listar simulados do usuário autenticado
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "10")));
  const skip = (page - 1) * limit;

  const [exams, total] = await prisma.$transaction([
    prisma.exam.findMany({
      where: { userId: session.user.id },
      include: {
        evaluation: { select: { name: true } },
        subject: { select: { name: true } },
        gradeLevel: { select: { name: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.exam.count({ where: { userId: session.user.id } }),
  ]);

  return NextResponse.json({ exams, total, page, limit });
}

// POST /api/simulados — criar rascunho de simulado
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json();
  const { title, teacherName, schoolName, evaluationSlug, subjectSlug, gradeLevelSlug } = body;

  if (!title || !teacherName || !evaluationSlug || !subjectSlug || !gradeLevelSlug) {
    return NextResponse.json(
      { error: "Campos obrigatórios: title, teacherName, evaluationSlug, subjectSlug, gradeLevelSlug." },
      { status: 400 }
    );
  }

  const [evaluation, subject, gradeLevel] = await Promise.all([
    prisma.evaluation.findUnique({ where: { slug: evaluationSlug } }),
    prisma.subject.findUnique({ where: { slug: subjectSlug } }),
    prisma.gradeLevel.findUnique({ where: { slug: gradeLevelSlug } }),
  ]);

  if (!evaluation || !subject || !gradeLevel) {
    return NextResponse.json(
      { error: "Avaliação, disciplina ou série inválida." },
      { status: 400 }
    );
  }

  const exam = await prisma.exam.create({
    data: {
      userId: session.user.id,
      title,
      teacherName,
      schoolName: schoolName ?? null,
      evaluationId: evaluation.id,
      subjectId: subject.id,
      gradeLevelId: gradeLevel.id,
      status: "draft",
    },
  });

  return NextResponse.json({ examId: exam.id }, { status: 201 });
}
