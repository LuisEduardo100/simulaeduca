import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCachedEntity, setCachedEntity } from "@/lib/cache";

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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body da requisição inválido." }, { status: 400 });
  }
  const { title, teacherName, schoolName, evaluationSlug, subjectSlug, gradeLevelSlug, headerConfig, difficulty } = body;

  if (!evaluationSlug || !subjectSlug || !gradeLevelSlug) {
    return NextResponse.json(
      { error: "Campos obrigatórios: evaluationSlug, subjectSlug, gradeLevelSlug." },
      { status: 400 }
    );
  }

  // Lookup with Redis cache (entities change rarely)
  async function cachedLookup<T extends { id: number | string }>(
    type: string, slug: string, finder: () => Promise<T | null>
  ): Promise<T | null> {
    const cached = await getCachedEntity<T>(type, slug);
    if (cached) return cached;
    const result = await finder();
    if (result) await setCachedEntity(type, slug, result);
    return result;
  }

  const [evaluation, subject, gradeLevel] = await Promise.all([
    cachedLookup("evaluation", evaluationSlug, () => prisma.evaluation.findUnique({ where: { slug: evaluationSlug } })),
    cachedLookup("subject", subjectSlug, () => prisma.subject.findUnique({ where: { slug: subjectSlug } })),
    cachedLookup("gradeLevel", gradeLevelSlug, () => prisma.gradeLevel.findUnique({ where: { slug: gradeLevelSlug } })),
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
      title: title || `Simulado ${evaluation.name} — ${subject.name} — ${gradeLevel.name}`,
      teacherName: teacherName || "Professor",
      schoolName: schoolName ?? null,
      evaluationId: evaluation.id,
      subjectId: subject.id,
      gradeLevelId: gradeLevel.id,
      status: "draft",
      headerConfig: headerConfig ?? null,
      difficulty: difficulty ?? null,
    },
  });

  return NextResponse.json({ examId: exam.id }, { status: 201 });
}
