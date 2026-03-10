"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function GlobalMetadata({
  evaluationSlug,
  setEvaluationSlug,
  subjectSlug,
  setSubjectSlug,
  gradeLevelSlug,
  setGradeLevelSlug,
}: {
  evaluationSlug: string;
  setEvaluationSlug: (v: string) => void;
  subjectSlug: string;
  setSubjectSlug: (v: string) => void;
  gradeLevelSlug: string;
  setGradeLevelSlug: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <Label>Avaliacao</Label>
        <Select onValueChange={setEvaluationSlug} value={evaluationSlug}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Selecionar..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="spaece">SPAECE</SelectItem>
            <SelectItem value="saeb">SAEB</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Disciplina</Label>
        <Select onValueChange={setSubjectSlug} value={subjectSlug}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Selecionar..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="matematica">Matematica</SelectItem>
            <SelectItem value="portugues">Lingua Portuguesa</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Serie</Label>
        <Select onValueChange={setGradeLevelSlug} value={gradeLevelSlug}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Selecionar..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5_ano">5o ano</SelectItem>
            <SelectItem value="9_ano">9o ano</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
