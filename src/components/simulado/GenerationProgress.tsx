"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { GenerationProgressData, DescriptorDistribution, DifficultyOrMixed } from "@/types";

interface GenerationProgressProps {
  examId: string;
  descriptors: DescriptorDistribution[];
  difficulty?: DifficultyOrMixed;
  onRetry?: () => void;
}

type Phase = "generating" | "completed" | "partial" | "failed" | "idle";

export function GenerationProgress({
  examId,
  descriptors,
  difficulty,
  onRetry,
}: GenerationProgressProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("generating");
  const [progress, setProgress] = useState<GenerationProgressData | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/simulados/${examId}/progresso`);
      if (!res.ok) return;
      const data: GenerationProgressData = await res.json();
      setProgress(data);

      if (data.status === "completed") {
        setPhase("completed");
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (data.status === "partial") {
        setPhase("partial");
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (data.status === "failed") {
        setPhase("failed");
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    } catch {
      // Silently retry on network error
    }
  }, [examId]);

  useEffect(() => {
    // Iniciar polling
    fetchProgress();
    pollingRef.current = setInterval(fetchProgress, 1500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchProgress]);

  async function handleResume() {
    setIsResuming(true);
    setPhase("generating");

    try {
      const res = await fetch("/api/simulados/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          descriptors: descriptors.map((d) => ({
            descriptorId: d.descriptorId,
            questionCount: d.questionCount,
          })),
          difficulty,
          resume: true,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        await fetchProgress();
        return;
      }

      if (data.success) {
        setPhase("completed");
      } else {
        // Fetch latest progress
        await fetchProgress();
      }
    } catch {
      await fetchProgress();
    } finally {
      setIsResuming(false);
      // Restart polling
      pollingRef.current = setInterval(fetchProgress, 1500);
    }
  }

  const totalExpected = progress?.totalExpected ?? 0;
  const totalGenerated = progress?.totalGenerated ?? 0;
  const percentage = totalExpected > 0 ? Math.round((totalGenerated / totalExpected) * 100) : 0;

  return (
    <Card className="p-6 space-y-6">
      {/* Barra de progresso */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {phase === "generating" && `Gerando questão ${totalGenerated + 1} de ${totalExpected}...`}
            {phase === "completed" && "Simulado gerado com sucesso!"}
            {phase === "partial" && `${totalGenerated} de ${totalExpected} questões geradas`}
            {phase === "failed" && "Erro na geração"}
          </span>
          <span className="text-muted-foreground">{percentage}%</span>
        </div>
        <Progress value={percentage} className="h-3" />
      </div>

      {/* Lista de questões geradas */}
      {progress && progress.questions.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {progress.questions.map((q) => (
            <div
              key={q.questionNumber}
              className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-md bg-muted/30"
            >
              <span className="text-green-600 shrink-0">&#10003;</span>
              <span className="text-muted-foreground">
                Questão {q.questionNumber}
              </span>
              <Badge variant="outline" className="font-mono text-xs">
                {q.descriptorCode}
              </Badge>
            </div>
          ))}

          {/* Questões pendentes (indicador visual) */}
          {phase === "generating" &&
            Array.from(
              { length: Math.min(5, totalExpected - totalGenerated) },
              (_, i) => (
                <div
                  key={`pending-${i}`}
                  className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-md"
                >
                  <span className="text-amber-500 shrink-0 animate-pulse">&#9203;</span>
                  <span className="text-muted-foreground">
                    Questão {totalGenerated + i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground">gerando...</span>
                </div>
              )
            )}
        </div>
      )}

      {/* Ações conforme status */}
      {phase === "completed" && (
        <div className="flex gap-3">
          <Button onClick={() => router.push(`/simulados/${examId}`)}>
            Ver Simulado
          </Button>
          <a href={`/api/simulados/pdf?examId=${examId}&type=exam`} target="_blank">
            <Button variant="outline">Baixar PDF</Button>
          </a>
        </div>
      )}

      {phase === "partial" && (
        <div className="space-y-3">
          <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            {totalGenerated} de {totalExpected} questões foram geradas. Deseja continuar de onde parou?
          </div>
          <div className="flex gap-3">
            <Button onClick={handleResume} disabled={isResuming}>
              {isResuming ? "Retomando..." : "Retomar Geração"}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/simulados/${examId}`)}
            >
              Ver o que foi gerado
            </Button>
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="space-y-3">
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800">
            Ocorreu um erro na geração das questões. Nenhuma questão foi salva.
          </div>
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Tentar novamente
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
