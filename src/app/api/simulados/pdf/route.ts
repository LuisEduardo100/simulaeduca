import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateExamPdf, generateAnswerKeyPdf } from "@/lib/pdf/generator";
import { readQuestionImageAsDataUri } from "@/lib/utils/image-storage";
import { rateLimitOrNull } from "@/lib/cache/rate-limiter";
import type { HeaderConfig } from "@/types";

// GET /api/simulados/pdf?examId=...&type=exam|answer_key
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const rl = await rateLimitOrNull(session.user.id, "pdf");
  if (rl) {
    return NextResponse.json({ error: rl.error }, { status: rl.status, headers: rl.headers });
  }

  const { searchParams } = new URL(request.url);
  const examId = searchParams.get("examId");
  const type = searchParams.get("type") ?? "exam";

  if (!examId) {
    return NextResponse.json({ error: "examId é obrigatório." }, { status: 400 });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      evaluation: { select: { name: true } },
      subject: { select: { name: true } },
      gradeLevel: { select: { name: true } },
      questions: {
        include: { descriptor: { select: { code: true } } },
        orderBy: { questionNumber: "asc" },
      },
    },
  });

  if (!exam || exam.userId !== session.user.id) {
    return NextResponse.json({ error: "Simulado não encontrado." }, { status: 404 });
  }

  if (exam.status !== "completed" && exam.status !== "partial") {
    return NextResponse.json(
      { error: "O simulado ainda não foi gerado completamente." },
      { status: 400 }
    );
  }

  if (exam.questions.length === 0) {
    return NextResponse.json(
      { error: "O simulado não possui questões geradas." },
      { status: 400 }
    );
  }

  // Resolver imagens das questões para data URIs (PDF renderiza inline)
  const questionsWithImages = await Promise.all(
    exam.questions.map(async (q) => {
      let imageDataUri: string | undefined;
      if (q.hasImage && q.imageUrl) {
        const dataUri = await readQuestionImageAsDataUri(q.imageUrl);
        if (dataUri) imageDataUri = dataUri;
      }
      return {
        number: q.questionNumber,
        stem: q.stem,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctAnswer: q.correctAnswer,
        justification: q.justification ?? undefined,
        descriptorCode: q.descriptor.code,
        hasImage: q.hasImage,
        imageDescription: q.imageDescription ?? undefined,
        imageDataUri,
      };
    })
  );

  const pdfData = {
    title: exam.title,
    teacherName: exam.teacherName,
    schoolName: exam.schoolName,
    subject: exam.subject.name,
    gradeLevel: exam.gradeLevel.name,
    evaluation: exam.evaluation.name,
    headerConfig: (exam.headerConfig as HeaderConfig | null) ?? null,
    questions: questionsWithImages,
  };

  const buffer =
    type === "answer_key"
      ? await generateAnswerKeyPdf(pdfData)
      : await generateExamPdf(pdfData);

  const filename =
    type === "answer_key"
      ? `gabarito-${examId.slice(0, 8)}.pdf`
      : `simulado-${examId.slice(0, 8)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
