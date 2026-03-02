"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface ResumeGenerationProps {
  examId: string;
}

export function ResumeGeneration({ examId }: ResumeGenerationProps) {
  const router = useRouter();
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResume() {
    setIsResuming(true);
    setError(null);

    try {
      // Fetch the exam progress to get the descriptor distribution
      const progressRes = await fetch(`/api/simulados/${examId}/progresso`);
      if (!progressRes.ok) throw new Error("Erro ao buscar progresso.");
      let progress;
      try {
        progress = await progressRes.json();
      } catch {
        throw new Error("Resposta inesperada do servidor.");
      }

      // We need to reconstruct the descriptor distribution from the exam
      // The resume endpoint handles continuation automatically
      const res = await fetch("/api/simulados/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          // The backend will read the existing questions and continue
          // We pass a minimal descriptor list — the backend handles resume logic
          descriptors: progress.questions.length > 0
            ? [{ descriptorId: 1, questionCount: progress.totalExpected }]
            : [],
          resume: true,
        }),
      });

      if (res.ok || res.status === 207) {
        router.refresh();
      } else {
        let errorMsg = "Erro ao retomar geracao.";
        try {
          const data = await res.json();
          errorMsg = data.error ?? errorMsg;
        } catch { /* resposta não é JSON */ }
        setError(errorMsg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsResuming(false);
    }
  }

  return (
    <div>
      <Button onClick={handleResume} disabled={isResuming} size="sm">
        {isResuming ? "Retomando geracao..." : "Retomar Geracao"}
      </Button>
      {error && (
        <p className="text-xs text-destructive mt-2">{error}</p>
      )}
    </div>
  );
}
