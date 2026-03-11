"use client";

import { useState } from "react";
import { StemRenderer } from "@/components/simulado/StemRenderer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export interface ExtractedQuestion {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  descriptorCode: string;
  difficulty: string;
  hasImage?: boolean;
  imageDescription?: string;
  imageUrl?: string;
}

export interface ExtractedQuestionUI extends ExtractedQuestion {
  id: string;
  selected: boolean;
}

export function QuestionCard({
  question,
  index,
  onToggle,
  onUpdate,
}: {
  question: ExtractedQuestionUI;
  index: number;
  onToggle: () => void;
  onUpdate: (patch: Partial<ExtractedQuestion>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stemPreview =
    question.stem.length > 120 ? question.stem.slice(0, 120) + "\u2026" : question.stem;

  return (
    <div
      className={`rounded-md border p-3 transition-colors ${
        question.selected
          ? "bg-blue-50 border-blue-200"
          : "bg-background border-border opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={question.selected}
          onChange={onToggle}
          className="mt-1 shrink-0"
        />
        <div className="flex-1 min-w-0">
          {/* Controles inline */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground shrink-0">
              Q{index + 1}
            </span>
            <Input
              className="h-6 w-16 text-xs px-1.5 py-0"
              placeholder="D07"
              value={question.descriptorCode}
              onChange={(e) => onUpdate({ descriptorCode: e.target.value.toUpperCase() })}
              maxLength={5}
              title="Codigo do descritor"
            />
            <Select
              value={question.difficulty || "_none"}
              onValueChange={(v) => onUpdate({ difficulty: v === "_none" ? "" : v })}
            >
              <SelectTrigger className="h-6 w-24 text-xs px-1.5 py-0">
                <SelectValue placeholder="Dific." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Dific.</SelectItem>
                <SelectItem value="facil">Facil</SelectItem>
                <SelectItem value="medio">Medio</SelectItem>
                <SelectItem value="dificil">Dificil</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={question.correctAnswer || "_none"}
              onValueChange={(v) => onUpdate({ correctAnswer: v === "_none" ? "" : v })}
            >
              <SelectTrigger className="h-6 w-20 text-xs px-1.5 py-0">
                <SelectValue placeholder="Gab." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Gab.</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
                <SelectItem value="D">D</SelectItem>
              </SelectContent>
            </Select>
            {question.hasImage && (
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                Imagem
              </Badge>
            )}
          </div>

          {/* Stem */}
          <StemRenderer stem={stemPreview} className="text-sm text-foreground leading-snug" />
          {question.stem.length > 120 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-blue-600 hover:underline mt-1"
            >
              {expanded ? "Recolher" : "Ver completo + alternativas"}
            </button>
          )}
          {expanded && (
            <div className="mt-2 space-y-1 text-sm border-t pt-2">
              <StemRenderer stem={question.stem} className="whitespace-pre-wrap text-foreground" />

              {/* Preview da imagem */}
              {question.hasImage && question.imageUrl && (
                <div className="my-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/question-images?path=${encodeURIComponent(question.imageUrl)}`}
                    alt={question.imageDescription || "Imagem da questao"}
                    className="max-h-48 max-w-full rounded border object-contain"
                  />
                  {question.imageDescription && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {question.imageDescription}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-2 space-y-0.5 text-muted-foreground">
                <p>A) {question.optionA}</p>
                <p>B) {question.optionB}</p>
                <p>C) {question.optionC}</p>
                <p>D) {question.optionD}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
