import { auth } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ResumeGeneration } from "@/components/simulado/ResumeGeneration";
import { StemRenderer } from "@/components/simulado/StemRenderer";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  generating: "Gerando...",
  completed: "Concluido",
  failed: "Falhou",
  partial: "Parcial",
};

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  draft: "secondary",
  generating: "outline",
  completed: "default",
  failed: "destructive",
  partial: "outline",
};

export default async function SimuladoDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const isAdmin = session.user.role === "admin";

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      evaluation: { select: { name: true } },
      subject: { select: { name: true } },
      gradeLevel: { select: { name: true } },
      questions: {
        include: {
          descriptor: { select: { code: true, description: true } },
        },
        orderBy: { questionNumber: "asc" },
      },
    },
  });

  if (!exam || exam.userId !== session.user.id) {
    notFound();
  }

  const options = ["A", "B", "C", "D"] as const;

  // Stats admin-only: contar reusadas vs geradas
  const reusedCount = isAdmin ? exam.questions.filter((q) => q.source === "reused").length : 0;
  const generatedCount = isAdmin ? exam.questions.length - reusedCount : 0;

  return (
    <main className="p-8 max-w-4xl mx-auto">
      {/* Cabecalho */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{exam.title}</h1>
            <Badge variant={STATUS_VARIANTS[exam.status] ?? "secondary"}>
              {STATUS_LABELS[exam.status] ?? exam.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {exam.evaluation.name} · {exam.subject.name} · {exam.gradeLevel.name} ·{" "}
            Prof. {exam.teacherName}
            {exam.schoolName && ` · ${exam.schoolName}`}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            {exam.questions.length} questao(oes)
            {exam.expectedQuestions > 0 && exam.status === "partial" && (
              <> de {exam.expectedQuestions} esperadas</>
            )}
            {" "} · {exam.creditsConsumed} credito(s) consumido(s) ·{" "}
            {new Date(exam.createdAt).toLocaleDateString("pt-BR")}
          </p>
          {isAdmin && exam.questions.length > 0 && (
            <p className="text-xs mt-1 text-blue-600">
              Admin: {generatedCount} gerada(s) · {reusedCount} reusada(s)
            </p>
          )}
        </div>
        <Link href="/simulados/historico">
          <Button variant="ghost" size="sm">&larr; Historico</Button>
        </Link>
      </div>

      {/* Botoes de download PDF */}
      {(exam.status === "completed" || (exam.status === "partial" && exam.questions.length > 0)) && (
        <div className="flex gap-3 mb-8">
          <a href={`/api/simulados/pdf?examId=${exam.id}&type=exam`} target="_blank">
            <Button>
              Baixar Prova (PDF)
            </Button>
          </a>
          <a href={`/api/simulados/pdf?examId=${exam.id}&type=answer_key`} target="_blank">
            <Button variant="outline">
              Baixar Gabarito (PDF)
            </Button>
          </a>
        </div>
      )}

      {exam.status === "generating" && (
        <Card className="p-6 mb-6 text-center">
          <p className="text-muted-foreground">
            As questoes estao sendo geradas pela IA. Aguarde alguns instantes e recarregue a pagina.
          </p>
        </Card>
      )}

      {exam.status === "partial" && (
        <Card className="p-6 mb-6 border-amber-200 bg-amber-50">
          <p className="text-amber-800 text-sm mb-3">
            {exam.questions.length} de {exam.expectedQuestions} questoes foram geradas.
            A geracao foi interrompida. Voce pode retomar de onde parou.
          </p>
          <ResumeGeneration examId={exam.id} />
        </Card>
      )}

      {exam.status === "failed" && (
        <Card className="p-6 mb-6 border-destructive">
          <p className="text-destructive text-sm">
            Houve um erro na geracao das questoes. Tente criar um novo simulado.
          </p>
        </Card>
      )}

      {/* Questoes */}
      {exam.questions.length > 0 && (
        <div className="space-y-6">
          {exam.questions.map((q) => (
            <Card key={q.id} className="p-6">
              <div className="flex items-start justify-between mb-3">
                <span className="font-bold text-sm">Questao {q.questionNumber}</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs font-mono">
                    {q.descriptor.code}
                  </Badge>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {q.difficulty}
                  </Badge>
                  {isAdmin && (
                    <Badge
                      variant={q.source === "reused" ? "default" : "outline"}
                      className={`text-xs ${q.source === "reused" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {q.source === "reused" ? "Reusada" : "Gerada"}
                    </Badge>
                  )}
                </div>
              </div>

              <StemRenderer stem={q.stem} className="text-sm mb-4 leading-relaxed" />

              <div className="space-y-2">
                {options.map((letter) => {
                  const optionText = q[`option${letter}` as "optionA" | "optionB" | "optionC" | "optionD"];
                  const isCorrect = q.correctAnswer === letter;
                  return (
                    <div
                      key={letter}
                      className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                        isCorrect ? "bg-green-50 border border-green-200" : ""
                      }`}
                    >
                      <span className={`font-bold w-4 shrink-0 ${isCorrect ? "text-green-700" : ""}`}>
                        {letter})
                      </span>
                      <span className={isCorrect ? "text-green-800" : ""}>{optionText}</span>
                    </div>
                  );
                })}
              </div>

              {q.justification && (
                <>
                  <Separator className="my-4" />
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold">Resolucao:</span> {q.justification}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
