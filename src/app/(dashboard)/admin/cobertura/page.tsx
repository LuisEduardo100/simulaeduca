"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  BookOpen,
  FileQuestion,
  PieChart,
} from "lucide-react";

interface DescriptorCoverage {
  id: number;
  code: string;
  description: string;
  themeName: string;
  romanNumeral: string | null;
  subjectName: string;
  subjectSlug: string;
  gradeLevelName: string;
  gradeLevelSlug: string;
  evaluationName: string;
  chunkCount: number;
  questionBankCount: number;
  questionsGenerated: number;
}

interface CoverageData {
  summary: {
    totalDescriptors: number;
    withCoverage: number;
    withoutCoverage: number;
    coveragePercent: number;
    totalChunks: number;
  };
  descriptors: DescriptorCoverage[];
}

type FilterStatus = "all" | "covered" | "partial" | "uncovered";

function getCoverageStatus(chunkCount: number): "covered" | "partial" | "uncovered" {
  if (chunkCount >= 5) return "covered";
  if (chunkCount > 0) return "partial";
  return "uncovered";
}

export default function AdminCoberturaPage() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");

  const fetchCoverage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/descriptor-coverage");
      if (!res.ok) throw new Error("Erro ao buscar cobertura");
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  if (loading && !data) return <CoverageSkeleton />;
  if (error && !data)
    return (
      <div className="p-8 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={fetchCoverage}>Tentar novamente</Button>
      </div>
    );
  if (!data) return null;

  // Group descriptors by theme
  const grouped = data.descriptors.reduce<
    Record<string, { theme: string; roman: string | null; descriptors: DescriptorCoverage[] }>
  >((acc, d) => {
    const key = `${d.evaluationName}|${d.subjectName}|${d.gradeLevelName}|${d.themeName}`;
    if (!acc[key]) {
      acc[key] = { theme: d.themeName, roman: d.romanNumeral, descriptors: [] };
    }
    acc[key].descriptors.push(d);
    return acc;
  }, {});

  const filteredGroups = Object.entries(grouped)
    .map(([key, group]) => ({
      key,
      ...group,
      descriptors: group.descriptors.filter((d) => {
        if (filter === "all") return true;
        return getCoverageStatus(d.chunkCount) === filter;
      }),
    }))
    .filter((g) => g.descriptors.length > 0);

  const partialCount = data.descriptors.filter(
    (d) => d.chunkCount > 0 && d.chunkCount < 5
  ).length;

  return (
    <main className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cobertura de Descritores</h1>
          <p className="text-sm text-muted-foreground">
            Visualize quais descritores possuem conteudo vetorizado na base RAG
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchCoverage}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={PieChart}
          label="Cobertura"
          value={`${data.summary.coveragePercent}%`}
          detail={`${data.summary.withCoverage} de ${data.summary.totalDescriptors}`}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Com Cobertura"
          value={data.summary.withCoverage}
          detail="5+ chunks"
          className="text-emerald-600"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Cobertura Parcial"
          value={partialCount}
          detail="1-4 chunks"
          className="text-amber-500"
        />
        <SummaryCard
          icon={XCircle}
          label="Sem Cobertura"
          value={data.summary.withoutCoverage}
          detail="0 chunks (gera sem RAG)"
          className="text-red-500"
        />
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">Progresso da Cobertura RAG</span>
            <span className="text-muted-foreground">
              {data.summary.totalChunks.toLocaleString("pt-BR")} chunks totais
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden flex">
            {data.summary.totalDescriptors > 0 && (
              <>
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${
                      (data.descriptors.filter((d) => d.chunkCount >= 5).length /
                        data.summary.totalDescriptors) *
                      100
                    }%`,
                  }}
                />
                <div
                  className="bg-amber-400 transition-all duration-500"
                  style={{
                    width: `${
                      (partialCount / data.summary.totalDescriptors) * 100
                    }%`,
                  }}
                />
              </>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Coberto (5+)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Parcial (1-4)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
              Sem cobertura
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-2">
        {(
          [
            { value: "all", label: "Todos" },
            { value: "covered", label: "Cobertos" },
            { value: "partial", label: "Parciais" },
            { value: "uncovered", label: "Sem cobertura" },
          ] as const
        ).map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Descriptor list grouped by theme */}
      {filteredGroups.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum descritor encontrado com esse filtro.
        </p>
      ) : (
        filteredGroups.map((group) => (
          <Card key={group.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {group.roman ? `Tema ${group.roman} - ` : ""}
                {group.theme}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {group.descriptors.map((d) => (
                  <DescriptorRow key={d.id} descriptor={d} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </main>
  );
}

function DescriptorRow({ descriptor: d }: { descriptor: DescriptorCoverage }) {
  const status = getCoverageStatus(d.chunkCount);

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
      {/* Status icon */}
      <div className="mt-0.5">
        {status === "covered" && (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        )}
        {status === "partial" && (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )}
        {status === "uncovered" && (
          <XCircle className="h-4 w-4 text-red-400" />
        )}
      </div>

      {/* Descriptor info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              status === "covered"
                ? "default"
                : status === "partial"
                  ? "outline"
                  : "destructive"
            }
            className="text-xs font-mono"
          >
            {d.code}
          </Badge>
          <span className="text-sm truncate">{d.description}</span>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            {d.chunkCount} chunk{d.chunkCount !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {d.questionBankCount} no banco
          </span>
          <span className="flex items-center gap-1">
            <FileQuestion className="h-3 w-3" />
            {d.questionsGenerated} gerada{d.questionsGenerated !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  detail?: string;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${className ?? "text-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${className ?? ""}`}>{value}</p>
        {detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CoverageSkeleton() {
  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-16" />
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
    </div>
  );
}
