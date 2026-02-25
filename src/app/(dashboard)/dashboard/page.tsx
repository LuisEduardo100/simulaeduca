import { auth } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [user, examCount, recentExams] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, creditsBalance: true, planType: true },
    }),
    prisma.exam.count({ where: { userId } }),
    prisma.exam.findMany({
      where: { userId },
      include: {
        evaluation: { select: { name: true } },
        subject: { select: { name: true } },
        gradeLevel: { select: { name: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const STATUS_VARIANTS: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
    draft: "secondary",
    generating: "outline",
    completed: "default",
    failed: "destructive",
  };

  const STATUS_LABELS: Record<string, string> = {
    draft: "Rascunho",
    generating: "Gerando...",
    completed: "Concluído",
    failed: "Falhou",
  };

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">
        Olá, {user?.name?.split(" ")[0] ?? "professor"}!
      </h1>
      <p className="text-muted-foreground mb-8">Bem-vindo ao SimulaEduca.</p>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Créditos disponíveis</p>
          <p className="text-3xl font-bold mt-1">{user?.creditsBalance ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            Plano: {user?.planType ?? "free"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Simulados criados</p>
          <p className="text-3xl font-bold mt-1">{examCount}</p>
        </Card>
        <Card className="p-5 flex flex-col justify-between">
          <p className="text-sm text-muted-foreground">Ação rápida</p>
          <Link href="/simulados/novo" className="mt-3">
            <Button className="w-full">+ Criar Simulado</Button>
          </Link>
        </Card>
      </div>

      {/* Simulados recentes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Simulados recentes</h2>
          <Link href="/simulados/historico">
            <Button variant="ghost" size="sm">Ver todos</Button>
          </Link>
        </div>

        {recentExams.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            Nenhum simulado criado ainda.
          </Card>
        ) : (
          <div className="space-y-2">
            {recentExams.map((exam) => (
              <Link key={exam.id} href={`/simulados/${exam.id}`}>
                <Card className="p-4 flex items-center justify-between hover:bg-accent transition-colors cursor-pointer">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{exam.title}</span>
                      <Badge variant={STATUS_VARIANTS[exam.status] ?? "secondary"} className="text-xs">
                        {STATUS_LABELS[exam.status] ?? exam.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {exam.evaluation.name} · {exam.subject.name} · {exam.gradeLevel.name} ·{" "}
                      {exam._count.questions} questão(ões)
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(exam.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
