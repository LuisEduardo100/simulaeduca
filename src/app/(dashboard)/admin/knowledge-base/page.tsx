"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  QuestionCard,
  type ExtractedQuestion,
  type ExtractedQuestionUI,
} from "@/components/admin/question-card";
import { GlobalMetadata } from "@/components/admin/global-metadata";

interface Material {
  sourceFileName: string | null;
  sourceType: string;
  chunkCount: number;
  createdAt: string;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  text: "Texto",
};

export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState<"upload" | "list">("upload");

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");
  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Smart extraction state
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExtractedQuestionUI[] | null>(null);
  const [wasTruncated, setWasTruncated] = useState(false);

  // Question ingestion state
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Reference material fallback state
  const [showReferenceMode, setShowReferenceMode] = useState(false);
  const [refDescriptorCode, setRefDescriptorCode] = useState("");
  const [refDifficulty, setRefDifficulty] = useState("");
  const [isIngestingRef, setIsIngestingRef] = useState(false);
  const [refResult, setRefResult] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | null>(null);

  // List state
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "list") {
      fetchMaterials();
    }
  }, [activeTab]);

  async function fetchMaterials() {
    setIsLoadingList(true);
    try {
      const res = await fetch("/api/admin/ingest");
      const data = await res.json();
      setMaterials(data);
    } catch {
      // silenciar erro de carregamento
    } finally {
      setIsLoadingList(false);
    }
  }

  function resetState() {
    setQuestions(null);
    setExtractError(null);
    setIngestResult(null);
    setIngestError(null);
    setWasTruncated(false);
    setShowReferenceMode(false);
    setRefResult(null);
    setRefError(null);
  }

  // ─── Modo Smart: Extrair questoes com IA ─────────────────────────────────────

  async function handleExtractQuestions() {
    resetState();

    if (!file && !textContent.trim()) {
      setExtractError("Selecione um arquivo ou cole um texto.");
      return;
    }

    setIsExtracting(true);
    try {
      let data;

      if (file) {
        // Enviar arquivo para extração server-side
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/admin/ingest/extract-from-file", {
          method: "POST",
          body: formData,
        });
        data = await res.json();
        if (!res.ok) {
          setExtractError(data.error ?? "Erro ao extrair questoes.");
          return;
        }
      } else {
        // Enviar texto para extração via endpoint de scraping
        const res = await fetch("/api/admin/scrape/extract-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textContent }),
        });
        data = await res.json();
        if (!res.ok) {
          setExtractError(data.error ?? "Erro na extracao com IA.");
          return;
        }
      }

      if (data.wasTruncated) setWasTruncated(true);

      if (data.total === 0) {
        setExtractError(
          "Nenhuma questao de multipla escolha encontrada. Use 'Ingerir como Material de Referencia' para apostilas e artigos."
        );
        return;
      }

      setQuestions(
        (data.questions as ExtractedQuestion[]).map((q, i) => ({
          ...q,
          id: `q-${i}-${Date.now()}`,
          selected: true,
        }))
      );
    } catch {
      setExtractError("Erro de conexao. Tente novamente.");
    } finally {
      setIsExtracting(false);
    }
  }

  // ─── Ingerir questoes extraidas ──────────────────────────────────────────────

  async function handleIngestQuestions() {
    if (!questions) return;
    const selected = questions.filter((q) => q.selected);
    if (selected.length === 0) {
      setIngestError("Selecione pelo menos uma questao.");
      return;
    }

    setIsIngesting(true);
    setIngestResult(null);
    setIngestError(null);
    try {
      const payload = {
        questions: selected.map((q) => ({
          stem: q.stem,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          correctAnswer: q.correctAnswer || undefined,
          descriptorCode: q.descriptorCode || undefined,
          difficulty: (["facil", "medio", "dificil"].includes(q.difficulty)
            ? q.difficulty
            : undefined) as "facil" | "medio" | "dificil" | undefined,
          subjectSlug: subjectSlug || undefined,
          gradeLevelSlug: gradeLevelSlug || undefined,
          evaluationSlug: evaluationSlug || undefined,
        })),
        sourceFileName: file?.name ?? "texto-manual",
      };

      const res = await fetch("/api/admin/ingest/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setIngestError(data.error ?? "Erro ao ingerir questoes.");
      } else {
        setIngestResult(
          `${data.inserted} questao(oes) ingerida(s) com sucesso!${
            data.failed > 0 ? ` (${data.failed} falharam)` : ""
          }`
        );
        // Limpar form
        setFile(null);
        setTextContent("");
        setQuestions(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      setIngestError("Erro de conexao. Tente novamente.");
    } finally {
      setIsIngesting(false);
    }
  }

  // ─── Modo Referencia: Ingerir como material bruto ────────────────────────────

  async function handleIngestReference() {
    setRefResult(null);
    setRefError(null);

    if (!file && !textContent.trim()) {
      setRefError("Selecione um arquivo ou cole um texto.");
      return;
    }

    setIsIngestingRef(true);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      if (textContent.trim()) formData.append("text", textContent);
      if (refDescriptorCode) formData.append("descriptorCode", refDescriptorCode);
      if (subjectSlug) formData.append("subjectSlug", subjectSlug);
      if (gradeLevelSlug) formData.append("gradeLevelSlug", gradeLevelSlug);
      if (evaluationSlug) formData.append("evaluationSlug", evaluationSlug);
      if (refDifficulty) formData.append("difficulty", refDifficulty);

      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setRefError(data.error ?? "Erro desconhecido.");
      } else {
        setRefResult(`${data.chunksCreated} chunks criados com sucesso!`);
        setFile(null);
        setTextContent("");
        setShowReferenceMode(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      setRefError("Erro de conexao. Tente novamente.");
    } finally {
      setIsIngestingRef(false);
    }
  }

  // ─── Helpers de questoes ─────────────────────────────────────────────────────

  function toggleQuestion(id: string) {
    setQuestions((prev) =>
      prev
        ? prev.map((q) => (q.id === id ? { ...q, selected: !q.selected } : q))
        : prev
    );
  }

  function updateQuestion(id: string, patch: Partial<ExtractedQuestion>) {
    setQuestions((prev) =>
      prev
        ? prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
        : prev
    );
  }

  function selectAll(val: boolean) {
    setQuestions((prev) =>
      prev ? prev.map((q) => ({ ...q, selected: val })) : prev
    );
  }

  // ─── Delete material ────────────────────────────────────────────────────────

  async function handleDelete(sourceFileName: string) {
    if (!confirm(`Excluir todos os chunks de "${sourceFileName}"?`)) return;
    setDeletingFile(sourceFileName);
    try {
      const res = await fetch(
        `/api/admin/ingest?sourceFileName=${encodeURIComponent(sourceFileName)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await fetchMaterials();
      }
    } finally {
      setDeletingFile(null);
    }
  }

  const selectedCount = questions?.filter((q) => q.selected).length ?? 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Base de Conhecimento</h1>
      <p className="text-muted-foreground mb-6">
        Adicione materiais (provas, matrizes, simulados) para alimentar o banco vetorial RAG.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === "upload" ? "default" : "outline"}
          onClick={() => setActiveTab("upload")}
        >
          Adicionar Material
        </Button>
        <Button
          variant={activeTab === "list" ? "default" : "outline"}
          onClick={() => setActiveTab("list")}
        >
          Materiais Indexados
        </Button>
      </div>

      {/* Aba: Adicionar Material */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          {/* Metadata global */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Metadados Globais</h2>
            <GlobalMetadata
              evaluationSlug={evaluationSlug}
              setEvaluationSlug={setEvaluationSlug}
              subjectSlug={subjectSlug}
              setSubjectSlug={setSubjectSlug}
              gradeLevelSlug={gradeLevelSlug}
              setGradeLevelSlug={setGradeLevelSlug}
            />
          </Card>

          {/* Conteudo */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Conteudo</h2>

            {/* Upload de arquivo */}
            <div className="mb-4">
              <Label htmlFor="file">Arquivo (PDF, DOCX, TXT)</Label>
              <div className="mt-1 border-2 border-dashed border-muted rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    resetState();
                  }}
                />
                <label htmlFor="file" className="cursor-pointer">
                  {file ? (
                    <span className="text-sm font-medium">{file.name}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Clique para selecionar ou arraste um arquivo aqui
                    </span>
                  )}
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 my-4">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">OU</span>
              <Separator className="flex-1" />
            </div>

            {/* Texto direto */}
            <div>
              <Label htmlFor="textContent">Colar texto diretamente</Label>
              <textarea
                id="textContent"
                className="mt-1 w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Cole aqui questoes, matrizes de referencia ou qualquer conteudo educacional..."
                value={textContent}
                onChange={(e) => {
                  setTextContent(e.target.value);
                  resetState();
                }}
              />
            </div>
          </Card>

          {/* Mensagens de resultado/erro */}
          {ingestResult && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-green-800 text-sm">
              {ingestResult}
            </div>
          )}
          {refResult && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-green-800 text-sm">
              {refResult}
            </div>
          )}
          {extractError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
              {extractError}
            </div>
          )}
          {ingestError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
              {ingestError}
            </div>
          )}
          {refError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
              {refError}
            </div>
          )}

          {/* Botoes de acao (quando ainda nao extraiu) */}
          {!questions && !showReferenceMode && (
            <div className="flex gap-3">
              <Button
                onClick={handleExtractQuestions}
                disabled={isExtracting || (!file && !textContent.trim())}
                className="flex-1"
              >
                {isExtracting
                  ? "Analisando com IA..."
                  : "Extrair Questoes com IA"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  resetState();
                  setShowReferenceMode(true);
                }}
                disabled={isExtracting || (!file && !textContent.trim())}
              >
                Ingerir como Material de Referencia
              </Button>
            </div>
          )}

          {/* Aviso de truncamento */}
          {wasTruncated && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">
              O texto excedeu 40.000 caracteres e foi truncado para analise. Algumas questoes do final do documento podem nao ter sido extraidas.
            </div>
          )}

          {/* Questoes extraidas */}
          {questions && (
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {questions.length} questao(oes) extraida(s)
                </h2>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => selectAll(true)}>
                    Selecionar tudo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => selectAll(false)}>
                    Desmarcar tudo
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    index={i}
                    onToggle={() => toggleQuestion(q.id)}
                    onUpdate={(patch) => updateQuestion(q.id, patch)}
                  />
                ))}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selectedCount} de {questions.length} selecionada(s)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuestions(null);
                      resetState();
                    }}
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={handleIngestQuestions}
                    disabled={isIngesting || selectedCount === 0}
                  >
                    {isIngesting
                      ? "Ingerindo..."
                      : `Ingerir ${selectedCount} Questao(oes)`}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Modo referencia */}
          {showReferenceMode && (
            <Card className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Material de Referencia</h2>
              <p className="text-sm text-muted-foreground">
                Use este modo para matrizes de referencia, apostilas e artigos que nao sao provas com questoes.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dificuldade (opcional)</Label>
                  <Select onValueChange={setRefDifficulty} value={refDifficulty}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facil">Facil</SelectItem>
                      <SelectItem value="medio">Medio</SelectItem>
                      <SelectItem value="dificil">Dificil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Codigo do Descritor (opcional)</Label>
                  <Input
                    className="mt-1"
                    placeholder="ex: D07"
                    value={refDescriptorCode}
                    onChange={(e) => setRefDescriptorCode(e.target.value.toUpperCase())}
                    maxLength={5}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowReferenceMode(false)}
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleIngestReference}
                  disabled={isIngestingRef}
                  className="flex-1"
                >
                  {isIngestingRef ? "Processando..." : "Ingerir Material"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Aba: Materiais Indexados */}
      {activeTab === "list" && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Materiais na Base Vetorial</h2>
            <Button variant="outline" size="sm" onClick={fetchMaterials}>
              Atualizar
            </Button>
          </div>

          {isLoadingList ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum material indexado ainda. Adicione materiais na aba &quot;Adicionar Material&quot;.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="pb-2 font-medium">Arquivo</th>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Chunks</th>
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-3 max-w-xs truncate">
                      {m.sourceFileName ?? "(texto manual)"}
                    </td>
                    <td className="py-3">
                      <Badge variant="secondary">
                        {SOURCE_TYPE_LABELS[m.sourceType] ?? m.sourceType}
                      </Badge>
                    </td>
                    <td className="py-3">{m.chunkCount}</td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={deletingFile === m.sourceFileName}
                        onClick={() => handleDelete(m.sourceFileName ?? "")}
                      >
                        {deletingFile === m.sourceFileName ? "..." : "Excluir"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            Total: {materials.reduce((sum, m) => sum + m.chunkCount, 0)} chunks indexados
          </div>
        </Card>
      )}
    </div>
  );
}
