"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { DescriptorSelect, type Descriptor } from "./DescriptorSelect";
import { QuestionDistribution, TOTAL_QUESTIONS } from "./QuestionDistribution";
import { HeaderSelector } from "./HeaderSelector";
import { GenerationProgress } from "./GenerationProgress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  HeaderConfig,
  DescriptorDistribution,
  DifficultyOrMixed,
  ColumnLayout,
} from "@/types";

type FormStep = "config" | "generating";

interface UserProfileData {
  name?: string;
  school?: string;
}

interface SimuladoFormProps {
  userProfile?: UserProfileData;
}

export function SimuladoForm({ userProfile }: SimuladoFormProps) {
  const [step, setStep] = useState<FormStep>("config");

  // Campos obrigatórios (necessários para carregar descritores)
  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");

  // Título do simulado (opcional — se vazio, gera um título automático)
  const [title, setTitle] = useState("");

  // Cabeçalho da prova (contém todos os dados opcionais: professor, escola, etc.)
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>({
    mode: "standard",
  });

  // Descritores selecionados
  const [selectedDescriptorIds, setSelectedDescriptorIds] = useState<number[]>([]);
  const [selectedDescriptors, setSelectedDescriptors] = useState<
    { id: number; code: string; description: string }[]
  >([]);

  // Distribuição de questões
  const [distribution, setDistribution] = useState<DescriptorDistribution[]>([]);

  // Dificuldade geral
  const [difficulty, setDifficulty] = useState<DifficultyOrMixed>("medio");

  // Estado de submissão
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingExamId, setGeneratingExamId] = useState<string | null>(null);

  // Labels para montar título automático
  const evaluationLabels: Record<string, string> = { spaece: "SPAECE", saeb: "SAEB" };
  const subjectLabels: Record<string, string> = { matematica: "Matematica", portugues: "Lingua Portuguesa" };
  const gradeLabels: Record<string, string> = { "5_ano": "5o ano", "9_ano": "9o ano" };

  function handleDescriptorChange(ids: number[], descriptors: Descriptor[]) {
    setSelectedDescriptorIds(ids);
    setSelectedDescriptors(
      descriptors.map((d) => ({
        id: d.id,
        code: d.code,
        description: d.description,
      }))
    );
  }

  function resetDescriptors() {
    setSelectedDescriptorIds([]);
    setSelectedDescriptors([]);
    setDistribution([]);
  }

  function handleEvaluationChange(value: string) {
    setEvaluationSlug(value);
    resetDescriptors();
  }

  function handleSubjectChange(value: string) {
    setSubjectSlug(value);
    resetDescriptors();
  }

  function handleGradeLevelChange(value: string) {
    setGradeLevelSlug(value);
    resetDescriptors();
  }

  function buildTitle(): string {
    if (title.trim()) return title.trim();
    // Gerar título automático a partir dos campos obrigatórios
    const parts = [
      evaluationLabels[evaluationSlug],
      subjectLabels[subjectSlug],
      gradeLabels[gradeLevelSlug],
    ].filter(Boolean);
    return parts.length > 0 ? `Simulado ${parts.join(" — ")}` : "Simulado";
  }

  function buildTeacherName(): string {
    // Usa o nome do headerConfig se preenchido, senão usa perfil, senão "Professor"
    return headerConfig.teacherName?.trim() || userProfile?.name || "Professor";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!evaluationSlug || !subjectSlug || !gradeLevelSlug) {
      setError("Selecione avaliacao, disciplina e serie.");
      return;
    }

    if (selectedDescriptorIds.length === 0) {
      setError("Selecione ao menos um descritor.");
      return;
    }

    const total = distribution.reduce((sum, d) => sum + d.questionCount, 0);
    if (total !== TOTAL_QUESTIONS) {
      setError(`O total de questoes deve ser ${TOTAL_QUESTIONS}. Atual: ${total}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Criar rascunho do simulado
      const finalTitle = buildTitle();
      const finalTeacherName = buildTeacherName();

      const createRes = await fetch("/api/simulados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          teacherName: finalTeacherName,
          schoolName: headerConfig.school || userProfile?.school || null,
          evaluationSlug,
          subjectSlug,
          gradeLevelSlug,
          headerConfig,
          difficulty,
        }),
      });

      if (!createRes.ok) {
        let errorMsg = "Erro ao criar simulado.";
        try {
          const data = await createRes.json();
          errorMsg = data.error ?? errorMsg;
        } catch { /* resposta não é JSON */ }
        throw new Error(errorMsg);
      }

      let examId: string;
      try {
        const createData = await createRes.json();
        examId = createData.examId;
      } catch {
        throw new Error("Resposta inesperada do servidor ao criar simulado.");
      }

      // 2. Iniciar geração com IA
      setGeneratingExamId(examId);
      setStep("generating");

      const gerarRes = await fetch("/api/simulados/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          descriptors: distribution.map((d) => ({
            descriptorId: d.descriptorId,
            questionCount: d.questionCount,
          })),
          difficulty,
        }),
      });

      if (!gerarRes.ok && gerarRes.status !== 207) {
        let errorMsg = "Erro ao gerar questoes.";
        try {
          const data = await gerarRes.json();
          errorMsg = data.error ?? errorMsg;
        } catch { /* resposta não é JSON */ }
        throw new Error(errorMsg);
      }
    } catch (err) {
      if (!generatingExamId) {
        setError(err instanceof Error ? err.message : "Erro inesperado.");
        setStep("config");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Tela de progresso
  if (step === "generating" && generatingExamId) {
    return (
      <GenerationProgress
        examId={generatingExamId}
        descriptors={distribution}
        difficulty={difficulty}
        onRetry={() => {
          setStep("config");
          setGeneratingExamId(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Configuração da prova — campos obrigatórios */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Configuracao da Prova</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="evaluation">Avaliacao *</Label>
            <Select onValueChange={handleEvaluationChange} value={evaluationSlug}>
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
            <Select onValueChange={handleSubjectChange} value={subjectSlug}>
              <SelectTrigger id="subject" className="mt-1">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="matematica">Matematica</SelectItem>
                <SelectItem value="portugues">Lingua Portuguesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="gradeLevel">Serie *</Label>
            <Select onValueChange={handleGradeLevelChange} value={gradeLevelSlug}>
              <SelectTrigger id="gradeLevel" className="mt-1">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5_ano">5o ano</SelectItem>
                <SelectItem value="9_ano">9o ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Título opcional */}
        <div className="mt-4">
          <Label htmlFor="title">
            Titulo do simulado{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            id="title"
            className="mt-1"
            placeholder={
              evaluationSlug && subjectSlug && gradeLevelSlug
                ? `Ex: Simulado ${evaluationLabels[evaluationSlug] ?? ""} — ${gradeLabels[gradeLevelSlug] ?? ""}`
                : "Sera gerado automaticamente se nao preenchido"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </Card>

      {/* 2. Cabeçalho da prova */}
      <Card className="p-6">
        <HeaderSelector
          config={headerConfig}
          onChange={setHeaderConfig}
          defaultTeacherName={userProfile?.name}
          defaultSchool={userProfile?.school}
        />
      </Card>

      {/* 3. Seleção de descritores */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Selecao de Descritores</h2>
        <DescriptorSelect
          selectedIds={selectedDescriptorIds}
          onChange={handleDescriptorChange}
          evaluationSlug={evaluationSlug}
          subjectSlug={subjectSlug}
          gradeLevelSlug={gradeLevelSlug}
        />
      </Card>

      {/* 4. Distribuição de questões */}
      {selectedDescriptorIds.length > 0 && (
        <Card className="p-6">
          <QuestionDistribution
            selectedDescriptors={selectedDescriptors}
            distribution={distribution}
            onDistributionChange={setDistribution}
          />
        </Card>
      )}

      {/* 5. Dificuldade e Layout */}
      {selectedDescriptorIds.length > 0 && (
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Dificuldade Geral</h2>
              <Select
                value={difficulty}
                onValueChange={(v) => setDifficulty(v as DifficultyOrMixed)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facil">Facil</SelectItem>
                  <SelectItem value="medio">Medio</SelectItem>
                  <SelectItem value="dificil">Dificil</SelectItem>
                  <SelectItem value="misto">Misto (randomizado por questao)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-4">Layout da Prova</h2>
              <RadioGroup
                value={String(headerConfig.columns ?? 1)}
                onValueChange={(v) =>
                  setHeaderConfig({ ...headerConfig, columns: Number(v) as ColumnLayout })
                }
                className="space-y-2"
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <RadioGroupItem value="1" />
                  <div>
                    <span className="text-sm font-medium">1 coluna</span>
                    <p className="text-xs text-muted-foreground">Layout padrao, mais legivel</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <RadioGroupItem value="2" />
                  <div>
                    <span className="text-sm font-medium">2 colunas</span>
                    <p className="text-xs text-muted-foreground">Economiza papel, ideal para impressao</p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={
          isSubmitting ||
          !evaluationSlug ||
          !subjectSlug ||
          !gradeLevelSlug ||
          selectedDescriptorIds.length === 0 ||
          distribution.reduce((sum, d) => sum + d.questionCount, 0) !== TOTAL_QUESTIONS
        }
      >
        {isSubmitting
          ? "Criando simulado..."
          : `Gerar Simulado (${TOTAL_QUESTIONS} questoes)`}
      </Button>

      {isSubmitting && (
        <p className="text-center text-sm text-muted-foreground">
          Preparando a geracao das questoes com IA...
        </p>
      )}
    </form>
  );
}
