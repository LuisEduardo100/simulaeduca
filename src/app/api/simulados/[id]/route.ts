import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// DELETE /api/simulados/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  if (!exam || exam.userId !== session.user.id) {
    return NextResponse.json({ error: "Simulado não encontrado." }, { status: 404 });
  }

  // Não permitir deletar simulados em geração ativa
  if (exam.status === "generating") {
    return NextResponse.json(
      { error: "Não é possível excluir um simulado que está sendo gerado. Aguarde a conclusão." },
      { status: 409 }
    );
  }

  // Desvincular credit_transactions (set examId = null, não deletar histórico de créditos)
  await prisma.creditTransaction.updateMany({
    where: { examId: id },
    data: { examId: null },
  });

  // Deletar question_usages referenciando este exam
  await prisma.$executeRawUnsafe(
    `DELETE FROM question_usages WHERE exam_id = $1::uuid`,
    id
  );

  // Deletar exam (cascade deleta exam_questions automaticamente)
  await prisma.exam.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
