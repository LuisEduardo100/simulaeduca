"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Descriptor {
  id: number;
  code: string;
  description: string;
  theme: { name: string; romanNumeral: string | null };
}

interface DescriptorSelectProps {
  value: string;
  onChange: (value: string) => void;
  evaluationSlug: string;
  subjectSlug: string;
  gradeLevelSlug: string;
  disabled?: boolean;
}

export function DescriptorSelect({
  value,
  onChange,
  evaluationSlug,
  subjectSlug,
  gradeLevelSlug,
  disabled,
}: DescriptorSelectProps) {
  const [descriptors, setDescriptors] = useState<Descriptor[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!evaluationSlug || !subjectSlug || !gradeLevelSlug) {
      setDescriptors([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ evaluationSlug, subjectSlug, gradeLevelSlug });
    fetch(`/api/descritores?${params}`)
      .then((r) => r.json())
      .then((data) => setDescriptors(Array.isArray(data) ? data : []))
      .catch(() => setDescriptors([]))
      .finally(() => setLoading(false));
  }, [evaluationSlug, subjectSlug, gradeLevelSlug]);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || loading}>
      <SelectTrigger>
        <SelectValue placeholder={loading ? "Carregando..." : "Selecionar descritor..."} />
      </SelectTrigger>
      <SelectContent>
        {descriptors.map((d) => (
          <SelectItem key={d.id} value={String(d.id)}>
            <span className="font-mono text-xs mr-2 text-muted-foreground">{d.code}</span>
            {d.description.length > 60 ? d.description.slice(0, 60) + "…" : d.description}
          </SelectItem>
        ))}
        {!loading && descriptors.length === 0 && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            Nenhum descritor encontrado.
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
