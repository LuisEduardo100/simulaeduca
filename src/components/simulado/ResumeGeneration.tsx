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
      const res = await fetch("/api/simulados/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
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
