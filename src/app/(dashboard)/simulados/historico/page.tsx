"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Exam {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  totalQuestions: number;
  evaluation: { name: string };
  subject: { name: string };
  gradeLevel: { name: string };
  _count: { questions: number };
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  generating: "Gerando...",
  completed: "Concluído",
  failed: "Falhou",
};

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  draft: "secondary",
  generating: "outline",
  completed: "default",
  failed: "destructive",
};

export default function HistoricoPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch("/api/simulados?limit=20")
      .then((r) => r.json())
      .then((data) => {
        setExams(data.exams ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Simulados</h1>
          <p className="text-muted-foreground mt-1">{total} simulado(s) no total</p>
        </div>
        <Link href="/simulados/novo">
          <Button>+ Novo Simulado</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : exams.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">Nenhum simulado criado ainda.</p>
          <Link href="/simulados/novo">
            <Button>Criar primeiro simulado</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Card key={exam.id} className="p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-medium truncate">{exam.title}</span>
                  <Badge variant={STATUS_VARIANTS[exam.status] ?? "secondary"}>
                    {STATUS_LABELS[exam.status] ?? exam.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {exam.evaluation.name} · {exam.subject.name} · {exam.gradeLevel.name} ·{" "}
                  {exam._count.questions} questão(ões) ·{" "}
                  {new Date(exam.createdAt).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {exam.status === "completed" && (
                  <>
                    <a href={`/api/simulados/pdf?examId=${exam.id}&type=exam`} target="_blank">
                      <Button variant="outline" size="sm">Prova</Button>
                    </a>
                    <a href={`/api/simulados/pdf?examId=${exam.id}&type=answer_key`} target="_blank">
                      <Button variant="outline" size="sm">Gabarito</Button>
                    </a>
                  </>
                )}
                <Link href={`/simulados/${exam.id}`}>
                  <Button variant="ghost" size="sm">Ver</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
