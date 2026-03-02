"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Descriptor {
  id: number;
  code: string;
  description: string;
  theme: { name: string; romanNumeral: string | null };
}

interface DescriptorSelectProps {
  selectedIds: number[];
  onChange: (ids: number[], descriptors: Descriptor[]) => void;
  evaluationSlug: string;
  subjectSlug: string;
  gradeLevelSlug: string;
  disabled?: boolean;
}

export function DescriptorSelect({
  selectedIds,
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
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setDescriptors(list);
      })
      .catch(() => setDescriptors([]))
      .finally(() => setLoading(false));
  }, [evaluationSlug, subjectSlug, gradeLevelSlug]);

  function toggleDescriptor(id: number) {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter((sid) => sid !== id)
      : [...selectedIds, id];
    onChange(newIds, descriptors.filter((d) => newIds.includes(d.id)));
  }

  function selectAll() {
    const allIds = descriptors.map((d) => d.id);
    onChange(allIds, descriptors);
  }

  function clearAll() {
    onChange([], []);
  }

  if (loading) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground text-center">
        Carregando descritores...
      </div>
    );
  }

  if (!evaluationSlug || !subjectSlug || !gradeLevelSlug) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground text-center">
        Selecione avaliação, disciplina e série para ver os descritores.
      </div>
    );
  }

  if (descriptors.length === 0) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground text-center">
        Nenhum descritor encontrado para esta combinação.
      </div>
    );
  }

  // Agrupar por tema
  const grouped = descriptors.reduce<Record<string, Descriptor[]>>((acc, d) => {
    const key = d.theme.romanNumeral
      ? `${d.theme.romanNumeral} — ${d.theme.name}`
      : d.theme.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selectedIds.length} de {descriptors.length} descritor(es) selecionado(s)
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectAll}
            disabled={disabled || selectedIds.length === descriptors.length}
          >
            Selecionar Todos
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearAll}
            disabled={disabled || selectedIds.length === 0}
          >
            Limpar Todos
          </Button>
        </div>
      </div>

      <div className="rounded-md border max-h-80 overflow-y-auto">
        {Object.entries(grouped).map(([themeName, descs]) => (
          <div key={themeName}>
            <div className="bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground sticky top-0">
              {themeName}
            </div>
            {descs.map((d) => (
              <label
                key={d.id}
                className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer border-b last:border-b-0"
              >
                <Checkbox
                  checked={selectedIds.includes(d.id)}
                  onCheckedChange={() => toggleDescriptor(d.id)}
                  disabled={disabled}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-primary">
                      {d.code}
                    </span>
                    <span className="text-sm leading-snug">{d.description}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { Descriptor };
