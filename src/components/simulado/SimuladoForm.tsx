"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { DescriptorSelect } from "./DescriptorSelect";

interface QuestionRow {
  descriptorId: string;
  difficulty: "facil" | "medio" | "dificil";
}

export function SimuladoForm() {
  const router = useRouter();

  // Campos do cabeçalho
  const [title, setTitle] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");

  // Questões
  const [questions, setQuestions] = useState<QuestionRow[]>([
    { descriptorId: "", difficulty: "medio" },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addQuestion() {
    setQuestions((prev) => [...prev, { descriptorId: "", difficulty: "medio" }]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQuestion(index: number, field: keyof QuestionRow, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title || !teacherName || !evaluationSlug || !subjectSlug || !gradeLevelSlug) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }

    const validQuestions = questions.filter((q) => q.descriptorId);
    if (validQuestions.length === 0) {
      setError("Adicione ao menos uma questão com descritor selecionado.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Criar rascunho do simulado
      const createRes = await fetch("/api/simulados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, teacherName, schoolName, evaluationSlug, subjectSlug, gradeLevelSlug }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error ?? "Erro ao criar simulado.");
      }

      const { examId } = await createRes.json();

      // 2. Gerar questões com IA
      const gerarRes = await fetch("/api/simulados/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          descriptors: validQuestions.map((q) => ({
            descriptorId: Number(q.descriptorId),
            difficulty: q.difficulty,
          })),
        }),
      });

      if (!gerarRes.ok) {
        const data = await gerarRes.json();
        throw new Error(data.error ?? "Erro ao gerar questões.");
      }

      router.push(`/simulados/${examId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Informações do simulado */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Informações do Simulado</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="title">Título do simulado *</Label>
            <Input
              id="title"
              className="mt-1"
              placeholder="ex: Simulado SPAECE — 9º ano — Março 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="teacherName">Nome do professor *</Label>
            <Input
              id="teacherName"
              className="mt-1"
              placeholder="Nome completo"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="schoolName">Escola (opcional)</Label>
            <Input
              id="schoolName"
              className="mt-1"
              placeholder="Nome da escola"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="evaluation">Avaliação *</Label>
            <Select onValueChange={setEvaluationSlug} required>
              <SelectTrigger id="evaluation" className="mt-1">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spaece">SPAECE</SelectItem>
                <SelectItem value="saeb">SAEB</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="subject">Disciplina *</Label>
            <Select onValueChange={setSubjectSlug} required>
              <SelectTrigger id="subject" className="mt-1">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="matematica">Matemática</SelectItem>
                <SelectItem value="portugues">Língua Portuguesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="gradeLevel">Série *</Label>
            <Select onValueChange={setGradeLevelSlug} required>
              <SelectTrigger id="gradeLevel" className="mt-1">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5_ano">5º ano</SelectItem>
                <SelectItem value="9_ano">9º ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Questões */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Questões</h2>
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm font-medium w-8 text-center text-muted-foreground">
                {i + 1}.
              </span>
              <div className="flex-1">
                <DescriptorSelect
                  value={q.descriptorId}
                  onChange={(val) => updateQuestion(i, "descriptorId", val)}
                  evaluationSlug={evaluationSlug}
                  subjectSlug={subjectSlug}
                  gradeLevelSlug={gradeLevelSlug}
                  disabled={!evaluationSlug || !subjectSlug || !gradeLevelSlug}
                />
              </div>
              <div className="w-32">
                <Select
                  value={q.difficulty}
                  onValueChange={(val) => updateQuestion(i, "difficulty", val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facil">Fácil</SelectItem>
                    <SelectItem value="medio">Médio</SelectItem>
                    <SelectItem value="dificil">Difícil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {questions.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => removeQuestion(i)}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          onClick={addQuestion}
          disabled={questions.length >= 30}
        >
          + Adicionar Questão ({questions.length}/30)
        </Button>
      </Card>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting
          ? "Gerando questões com IA... Aguarde"
          : `Gerar Simulado (${questions.filter((q) => q.descriptorId).length} questão(ões))`}
      </Button>

      {isSubmitting && (
        <p className="text-center text-sm text-muted-foreground">
          Cada questão pode levar alguns segundos para ser gerada pela IA.
        </p>
      )}
    </form>
  );
}
