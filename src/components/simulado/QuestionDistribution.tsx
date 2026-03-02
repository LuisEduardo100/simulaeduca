"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DescriptorDistribution } from "@/types";

const TOTAL_QUESTIONS = 26;

interface QuestionDistributionProps {
  selectedDescriptors: { id: number; code: string; description: string }[];
  distribution: DescriptorDistribution[];
  onDistributionChange: (distribution: DescriptorDistribution[]) => void;
}

function calculateAutoDistribution(
  descriptors: { id: number; code: string; description: string }[]
): DescriptorDistribution[] {
  if (descriptors.length === 0) return [];

  const base = Math.floor(TOTAL_QUESTIONS / descriptors.length);
  let remainder = TOTAL_QUESTIONS % descriptors.length;

  return descriptors.map((d) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    return {
      descriptorId: d.id,
      descriptorCode: d.code,
      descriptorDescription: d.description,
      questionCount: base + extra,
    };
  });
}

export function QuestionDistribution({
  selectedDescriptors,
  distribution,
  onDistributionChange,
}: QuestionDistributionProps) {
  const [isManualMode, setIsManualMode] = useState(false);

  // Recalcular distribuição automática quando descritores mudam
  useEffect(() => {
    if (!isManualMode) {
      onDistributionChange(calculateAutoDistribution(selectedDescriptors));
    }
  }, [selectedDescriptors, isManualMode]);

  // Quando muda para modo manual, inicializar com a distribuição automática
  const toggleManualMode = useCallback(() => {
    if (!isManualMode) {
      // Entrando em modo manual — manter a distribuição atual
      setIsManualMode(true);
    } else {
      // Voltando para automático — recalcular
      setIsManualMode(false);
      onDistributionChange(calculateAutoDistribution(selectedDescriptors));
    }
  }, [isManualMode, selectedDescriptors, onDistributionChange]);

  function updateCount(descriptorId: number, value: number) {
    const newDist = distribution.map((d) =>
      d.descriptorId === descriptorId
        ? { ...d, questionCount: Math.max(0, value) }
        : d
    );
    onDistributionChange(newDist);
  }

  if (selectedDescriptors.length === 0) {
    return null;
  }

  const total = distribution.reduce((sum, d) => sum + d.questionCount, 0);
  const isValid = total === TOTAL_QUESTIONS;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Distribuição das {TOTAL_QUESTIONS} questões
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleManualMode}
        >
          {isManualMode ? "Distribuição automática" : "Ajustar manualmente"}
        </Button>
      </div>

      <div className="grid gap-2">
        {distribution.map((d) => (
          <div
            key={d.descriptorId}
            className="flex items-center gap-3 rounded-md border px-3 py-2"
          >
            <Badge variant="outline" className="font-mono text-xs shrink-0">
              {d.descriptorCode}
            </Badge>
            <span className="flex-1 text-sm truncate text-muted-foreground">
              {d.descriptorDescription.length > 50
                ? d.descriptorDescription.slice(0, 50) + "…"
                : d.descriptorDescription}
            </span>
            {isManualMode ? (
              <Input
                type="number"
                min={0}
                max={TOTAL_QUESTIONS}
                value={d.questionCount}
                onChange={(e) =>
                  updateCount(d.descriptorId, parseInt(e.target.value) || 0)
                }
                className="w-16 text-center"
              />
            ) : (
              <Badge variant="secondary" className="shrink-0">
                {d.questionCount} {d.questionCount === 1 ? "questão" : "questões"}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {/* Total e validação */}
      <div
        className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
          isValid
            ? "bg-green-50 text-green-800 border border-green-200"
            : "bg-red-50 text-red-800 border border-red-200"
        }`}
      >
        <span>Total de questões:</span>
        <span>
          {total} / {TOTAL_QUESTIONS}
          {!isValid && isManualMode && (
            <span className="ml-2 text-xs font-normal">
              ({total > TOTAL_QUESTIONS ? "excede" : "faltam"}{" "}
              {Math.abs(TOTAL_QUESTIONS - total)})
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export { TOTAL_QUESTIONS };
