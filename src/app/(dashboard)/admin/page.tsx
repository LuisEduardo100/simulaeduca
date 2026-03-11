"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Users,
  FileText,
  HelpCircle,
  Database,
  Globe,
  BookOpen,
  RefreshCw,
  ArrowRight,
  Recycle,
  CheckCircle,
  ImageIcon,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface QuestionBankBreakdown {
  total: number;
  generated: number;
  extracted: number;
  validated: number;
  with_image: number;
  total_reuses: number;
  avg_quality: number;
  never_used: number;
}

interface Stats {
  totalUsers: number;
  totalExams: number;
  totalQuestions: number;
  totalMaterialChunks: number;
  totalScrapedSources: number;
  totalQuestionBank: number;
  questionBankBreakdown: QuestionBankBreakdown;
  reuseStats: Record<string, number>;
  examsByStatus: { status: string; count: number }[];
  questionsPerDay: { date: string; count: number }[];
  recentExams: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
    userName: string;
  }[];
  topDescriptors: { code: string; description: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  generating: "Gerando",
  completed: "Concluido",
  failed: "Falhou",
  partial: "Parcial",
};

const STATUS_COLORS: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  draft: "secondary",
  generating: "outline",
  completed: "default",
  failed: "destructive",
  partial: "outline",
};

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Erro ao carregar estatisticas");
      setStats(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) return <AdminSkeleton />;
  if (error)
    return (
      <div className="p-8 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={fetchStats}>Tentar novamente</Button>
      </div>
    );
  if (!stats) return null;

  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Painel Administrativo</h1>
          <p className="text-sm text-muted-foreground">
            Visao geral do sistema SimulaEduca
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          icon={Users}
          label="Usuarios"
          value={stats.totalUsers}
        />
        <MetricCard
          icon={FileText}
          label="Simulados"
          value={stats.totalExams}
        />
        <MetricCard
          icon={HelpCircle}
          label="Questoes Geradas"
          value={stats.totalQuestions}
        />
        <MetricCard
          icon={Database}
          label="Chunks RAG"
          value={stats.totalMaterialChunks}
        />
        <MetricCard
          icon={Globe}
          label="Fontes Scraped"
          value={stats.totalScrapedSources}
        />
        <MetricCard
          icon={BookOpen}
          label="Banco de Questoes"
          value={stats.totalQuestionBank}
        />
      </div>

      {/* Question Bank Breakdown + Reuse Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Banco de Questoes — Detalhamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatItem
                icon={BookOpen}
                label="Total"
                value={stats.questionBankBreakdown.total}
              />
              <StatItem
                icon={HelpCircle}
                label="Geradas por IA"
                value={stats.questionBankBreakdown.generated}
                color="text-blue-600"
              />
              <StatItem
                icon={FileText}
                label="Extraidas"
                value={stats.questionBankBreakdown.extracted}
                color="text-purple-600"
              />
              <StatItem
                icon={CheckCircle}
                label="Validadas"
                value={stats.questionBankBreakdown.validated}
                color="text-green-600"
              />
            </div>
            <Separator />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatItem
                icon={ImageIcon}
                label="Com Imagem"
                value={stats.questionBankBreakdown.with_image}
                color="text-amber-600"
              />
              <StatItem
                icon={Recycle}
                label="Reutilizacoes"
                value={stats.questionBankBreakdown.total_reuses}
                color="text-cyan-600"
              />
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Qualidade Media</span>
                <p className="text-xl font-bold">
                  {stats.questionBankBreakdown.avg_quality.toFixed(2)}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Nunca Usadas</span>
                <p className="text-xl font-bold text-orange-600">
                  {stats.questionBankBreakdown.never_used.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
            {stats.questionBankBreakdown.total > 0 && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  <span>
                    {Math.round((stats.questionBankBreakdown.validated / stats.questionBankBreakdown.total) * 100)}% validadas
                  </span>
                  <span>
                    {Math.round((stats.questionBankBreakdown.with_image / stats.questionBankBreakdown.total) * 100)}% com imagem
                  </span>
                  <span>
                    {Math.round(((stats.questionBankBreakdown.total - stats.questionBankBreakdown.never_used) / stats.questionBankBreakdown.total) * 100)}% ja utilizadas ao menos 1x
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Reuse efficiency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eficiencia de Reuso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const generated = stats.reuseStats["generated"] ?? 0;
              const reused = stats.reuseStats["reused"] ?? 0;
              const total = generated + reused;
              const reusePct = total > 0 ? Math.round((reused / total) * 100) : 0;
              return (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Questoes geradas</span>
                      <span className="font-bold">{generated.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Questoes reusadas</span>
                      <span className="font-bold text-green-600">{reused.toLocaleString("pt-BR")}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total em simulados</span>
                      <span className="font-bold">{total.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-4 text-center">
                    <p className="text-3xl font-bold text-green-600">{reusePct}%</p>
                    <p className="text-xs text-muted-foreground mt-1">taxa de reuso</p>
                  </div>
                  {reused > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      {reused} questoes reusadas = {reused} creditos economizados
                    </p>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Questions per day - bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Questoes geradas (ultimos 30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.questionsPerDay.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma questao gerada no periodo
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.questionsPerDay}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v + "T00:00:00");
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(v: string) => {
                      const d = new Date(v + "T00:00:00");
                      return d.toLocaleDateString("pt-BR");
                    }}
                    formatter={(v: number) => [`${v} questoes`, "Total"]}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Simulados por status</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.examsByStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum simulado criado
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={stats.examsByStatus}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {stats.examsByStatus.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      v,
                      STATUS_LABELS[name] ?? name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {stats.examsByStatus.map((s, i) => (
                <div key={s.status} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                  {STATUS_LABELS[s.status] ?? s.status}: {s.count}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Recent exams + Top descriptors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent exams */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Simulados recentes</CardTitle>
            <Link href="/simulados/historico">
              <Button variant="ghost" size="sm">
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recentExams.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum simulado
              </p>
            ) : (
              <div className="space-y-3">
                {stats.recentExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{exam.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {exam.userName} -{" "}
                        {new Date(exam.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Badge variant={STATUS_COLORS[exam.status] ?? "secondary"}>
                      {STATUS_LABELS[exam.status] ?? exam.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top descriptors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Descritores mais utilizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topDescriptors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum descritor utilizado
              </p>
            ) : (
              <div className="space-y-2">
                {stats.topDescriptors.map((d) => (
                  <div
                    key={d.code}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-mono font-medium text-primary">
                        {d.code}
                      </span>
                      <span className="text-muted-foreground ml-2 truncate">
                        {d.description}
                      </span>
                    </div>
                    <Badge variant="secondary">{d.count}x</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</p>
      </CardContent>
    </Card>
  );
}

function StatItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color ?? "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color ?? ""}`}>
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
