"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { DescriptorDistribution, DifficultyOrMixed } from "@/types";

interface GenerationProgressProps {
  examId: string;
  descriptors: DescriptorDistribution[];
  difficulty?: DifficultyOrMixed;
  onRetry?: () => void;
}

type Phase = "generating" | "completed" | "partial" | "failed" | "idle";

interface QuestionEvent {
  questionNumber: number;
  descriptorCode: string;
}

// Parse SSE events from a text buffer, returning [parsedEvents, remainingBuffer]
function parseSSEBuffer(buffer: string): [{ event: string; data: string }[], string] {
  const events: { event: string; data: string }[] = [];
  const parts = buffer.split("\n\n");
  const remaining = parts.pop()!; // last part may be incomplete

  for (const part of parts) {
    if (!part.trim()) continue;
    const lines = part.split("\n");
    let eventName = "";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) eventName = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (eventName && data) {
      events.push({ event: eventName, data });
    }
  }

  return [events, remaining];
}

export function GenerationProgress({
  examId,
  descriptors,
  difficulty,
  onRetry,
}: GenerationProgressProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("generating");
  const [questions, setQuestions] = useState<QuestionEvent[]>([]);
  const [totalExpected, setTotalExpected] = useState(0);
  const [totalGenerated, setTotalGenerated] = useState(0);
  const [isResuming, setIsResuming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fallback polling — usado quando o stream SSE não está disponível (ex: refresh da página)
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/simulados/${examId}/progresso`);
        if (!res.ok) return;
        const data = await res.json();

        setTotalExpected(data.totalExpected);
        setTotalGenerated(data.totalGenerated);
        setQuestions(
          data.questions.map((q: { questionNumber: number; descriptorCode: string }) => ({
            questionNumber: q.questionNumber,
            descriptorCode: q.descriptorCode,
          }))
        );

        if (data.status === "completed") {
          setPhase("completed");
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
        } else if (data.status === "partial") {
          setPhase("partial");
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
        } else if (data.status === "failed") {
          setPhase("failed");
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } catch {
        // Silently retry
      }
    }, 2000);
  }, [examId]);

  // Consumir SSE stream de geração
  const startSSEGeneration = useCallback(
    async (resumeMode = false) => {
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
            resume: resumeMode,
          }),
        });

        // Se a resposta não é SSE (erro de validação), tratar como JSON
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          let data;
          try {
            data = await res.json();
          } catch {
            data = { error: "Erro inesperado do servidor." };
          }

          if (!res.ok) {
            setErrorMsg(data.error ?? "Erro na geração.");
            setPhase("failed");
            return;
          }

          // Resposta JSON de sucesso (ex: "todas já geradas")
          if (data.success) {
            setPhase("completed");
            setTotalGenerated(data.questionsGenerated ?? 0);
            return;
          }
        }

        // Ler o stream SSE
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const [events, remaining] = parseSSEBuffer(buffer);
          buffer = remaining;

          for (const { event, data } of events) {
            try {
              const parsed = JSON.parse(data);

              switch (event) {
                case "init":
                  setTotalExpected(parsed.totalExpected);
                  setTotalGenerated(parsed.alreadyGenerated ?? 0);
                  break;

                case "question":
                  setQuestions((prev) => [
                    ...prev,
                    {
                      questionNumber: parsed.questionNumber,
                      descriptorCode: parsed.descriptorCode,
                    },
                  ]);
                  setTotalGenerated(parsed.completed);
                  break;

                case "questionError":
                  // Questão individual falhou — mostrar no log mas continuar
                  break;

                case "complete":
                  setPhase("completed");
                  setTotalGenerated(parsed.questionsGenerated);
                  break;

                case "partial":
                  setPhase("partial");
                  setTotalGenerated(parsed.questionsGenerated);
                  break;

                case "error":
                  setPhase("failed");
                  setErrorMsg(parsed.error ?? "Erro na geração.");
                  setTotalGenerated(parsed.questionsGenerated ?? 0);
                  break;
              }
            } catch {
              // Ignore malformed event
            }
          }
        }
      } catch {
        // Se o fetch/stream falhou, tentar fallback de polling
        startPolling();
      }
    },
    [examId, descriptors, difficulty, startPolling]
  );

  // Iniciar geração na montagem do componente
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startSSEGeneration(false);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [startSSEGeneration]);

  // Retomar geração
  async function handleResume() {
    setIsResuming(true);
    setPhase("generating");
    setErrorMsg(null);

    try {
      await startSSEGeneration(true);
    } finally {
      setIsResuming(false);
    }
  }

  const percentage = totalExpected > 0 ? Math.round((totalGenerated / totalExpected) * 100) : 0;

  // Ordenar questões por número
  const sortedQuestions = [...questions].sort((a, b) => a.questionNumber - b.questionNumber);

  // Calcular quais questões estão pendentes (números que ainda não completaram)
  const completedNumbers = new Set(questions.map((q) => q.questionNumber));
  const pendingNumbers: number[] = [];
  if (phase === "generating") {
    for (let n = 1; n <= totalExpected && pendingNumbers.length < 8; n++) {
      if (!completedNumbers.has(n)) {
        pendingNumbers.push(n);
      }
    }
  }

  return (
    <Card className="p-6 space-y-6">
      {/* Barra de progresso */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {phase === "generating" &&
              `Gerando questões... ${totalGenerated} de ${totalExpected}`}
            {phase === "completed" && "Simulado gerado com sucesso!"}
            {phase === "partial" &&
              `${totalGenerated} de ${totalExpected} questões geradas`}
            {phase === "failed" && (errorMsg ?? "Erro na geração")}
          </span>
          <span className="text-muted-foreground">{percentage}%</span>
        </div>
        <Progress value={percentage} className="h-3" />
      </div>

      {/* Lista de questões geradas + pendentes */}
      {(sortedQuestions.length > 0 || pendingNumbers.length > 0) && (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {sortedQuestions.map((q) => (
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

          {/* Indicadores das questões em processamento (números corretos) */}
          {pendingNumbers.map((num) => (
            <div
              key={`pending-${num}`}
              className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-md"
            >
              <span className="text-amber-500 shrink-0 animate-pulse">
                &#9203;
              </span>
              <span className="text-muted-foreground">
                Questão {num}
              </span>
              <span className="text-xs text-muted-foreground">
                gerando...
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Ações conforme status */}
      {phase === "completed" && (
        <div className="flex gap-3">
          <Button onClick={() => router.push(`/simulados/${examId}`)}>
            Ver Simulado
          </Button>
          <a
            href={`/api/simulados/pdf?examId=${examId}&type=exam`}
            target="_blank"
          >
            <Button variant="outline">Baixar PDF</Button>
          </a>
        </div>
      )}

      {phase === "partial" && (
        <div className="space-y-3">
          <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            {totalGenerated} de {totalExpected} questões foram geradas. Deseja
            continuar de onde parou?
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
            {errorMsg ?? "Ocorreu um erro na geração das questões."}
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
