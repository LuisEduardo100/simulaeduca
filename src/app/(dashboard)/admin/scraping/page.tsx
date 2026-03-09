"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FoundFile {
  url: string;
  filename: string;
  type: "pdf" | "docx" | "txt";
}

interface IngestFileResult {
  url: string;
  filename: string;
  status: "success" | "error";
  chunksCreated?: number;
  error?: string;
  fileSize?: number;
}

interface ScrapedSource {
  id: string;
  pageUrl: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number | null;
  chunksCreated: number;
  descriptorCode: string | null;
  subjectSlug: string | null;
  gradeLevelSlug: string | null;
  evaluationSlug: string | null;
  difficulty: string | null;
  createdAt: string;
}

interface ExtractedQuestion {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  descriptorCode: string;
  difficulty: string;
}

interface ExtractedQuestionUI extends ExtractedQuestion {
  id: string;
  selected: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function typeBadgeColor(type: string) {
  if (type === "pdf") return "bg-red-100 text-red-700 border-red-200";
  if (type === "docx") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

// ─── Metadata global — avaliação + disciplina + série ─────────────────────────

function GlobalMetadata({
  evaluationSlug, setEvaluationSlug,
  subjectSlug, setSubjectSlug,
  gradeLevelSlug, setGradeLevelSlug,
}: {
  evaluationSlug: string; setEvaluationSlug: (v: string) => void;
  subjectSlug: string; setSubjectSlug: (v: string) => void;
  gradeLevelSlug: string; setGradeLevelSlug: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <Label>Avaliação</Label>
        <Select onValueChange={setEvaluationSlug} value={evaluationSlug}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="spaece">SPAECE</SelectItem>
            <SelectItem value="saeb">SAEB</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Disciplina</Label>
        <Select onValueChange={setSubjectSlug} value={subjectSlug}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="matematica">Matemática</SelectItem>
            <SelectItem value="portugues">Língua Portuguesa</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Série</Label>
        <Select onValueChange={setGradeLevelSlug} value={gradeLevelSlug}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="5_ano">5º ano</SelectItem>
            <SelectItem value="9_ano">9º ano</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Metadata completa — para ingestão de texto bruto ─────────────────────────

function MetadataFields({
  evaluationSlug, setEvaluationSlug,
  subjectSlug, setSubjectSlug,
  gradeLevelSlug, setGradeLevelSlug,
  difficulty, setDifficulty,
  descriptorCode, setDescriptorCode,
}: {
  evaluationSlug: string; setEvaluationSlug: (v: string) => void;
  subjectSlug: string; setSubjectSlug: (v: string) => void;
  gradeLevelSlug: string; setGradeLevelSlug: (v: string) => void;
  difficulty: string; setDifficulty: (v: string) => void;
  descriptorCode: string; setDescriptorCode: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label>Avaliação</Label>
        <Select onValueChange={setEvaluationSlug} value={evaluationSlug}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="spaece">SPAECE</SelectItem>
            <SelectItem value="saeb">SAEB</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Disciplina</Label>
        <Select onValueChange={setSubjectSlug} value={subjectSlug}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="matematica">Matemática</SelectItem>
            <SelectItem value="portugues">Língua Portuguesa</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Série</Label>
        <Select onValueChange={setGradeLevelSlug} value={gradeLevelSlug}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="5_ano">5º ano</SelectItem>
            <SelectItem value="9_ano">9º ano</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Dificuldade</Label>
        <Select onValueChange={setDifficulty} value={difficulty}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="facil">Fácil</SelectItem>
            <SelectItem value="medio">Médio</SelectItem>
            <SelectItem value="dificil">Difícil</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Label>Código do Descritor (opcional)</Label>
        <Input
          className="mt-1"
          placeholder="ex: D07"
          value={descriptorCode}
          onChange={(e) => setDescriptorCode(e.target.value.toUpperCase())}
          maxLength={5}
        />
      </div>
    </div>
  );
}

// ─── Card de questão extraída (editável inline) ───────────────────────────────

function QuestionCard({
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
    question.stem.length > 120 ? question.stem.slice(0, 120) + "…" : question.stem;

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
              title="Código do descritor"
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
                <SelectItem value="facil">Fácil</SelectItem>
                <SelectItem value="medio">Médio</SelectItem>
                <SelectItem value="dificil">Difícil</SelectItem>
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
          </div>

          {/* Stem */}
          <p className="text-sm text-foreground leading-snug">{stemPreview}</p>
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
              <p className="whitespace-pre-wrap text-foreground">{question.stem}</p>
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

// ─── Aba 1: Scraping de Texto HTML ────────────────────────────────────────────

function HtmlScrapingTab() {
  // Passo 1 — scrape
  const [url, setUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapedTitle, setScrapedTitle] = useState<string | null>(null);
  const [scrapedText, setScrapedText] = useState("");
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [pageUrl, setPageUrl] = useState("");

  // Passo 2 — extração por IA
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExtractedQuestionUI[] | null>(null);

  // Metadata global para questões extraídas (evaluation + subject + grade por questão)
  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");

  // Passo 3 — ingerir questões
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ inserted: number; failed: number } | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Fluxo alternativo — ingerir como texto bruto (material de referência)
  const [showRawIngest, setShowRawIngest] = useState(false);
  const [rawEvaluation, setRawEvaluation] = useState("");
  const [rawSubject, setRawSubject] = useState("");
  const [rawGrade, setRawGrade] = useState("");
  const [rawDifficulty, setRawDifficulty] = useState("");
  const [rawDescriptor, setRawDescriptor] = useState("");
  const [isIngestingRaw, setIsIngestingRaw] = useState(false);
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  async function handleScrape(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setScrapeError(null);
    setScrapedText("");
    setScrapedTitle(null);
    setWordCount(null);
    setQuestions(null);
    setExtractError(null);
    setIngestResult(null);
    setIngestError(null);
    setShowRawIngest(false);
    setRawResult(null);
    setRawError(null);
    if (!url.trim()) { setScrapeError("Digite uma URL válida."); return; }

    setIsScraping(true);
    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setScrapeError(data.error ?? "Erro ao fazer scraping.");
      else {
        setScrapedTitle(data.title);
        setScrapedText(data.text);
        setWordCount(data.wordCount);
        setPageUrl(url.trim());
      }
    } catch { setScrapeError("Erro de conexão."); }
    finally { setIsScraping(false); }
  }

  async function handleExtract() {
    setExtractError(null);
    setQuestions(null);
    setIngestResult(null);
    setIngestError(null);
    if (!scrapedText.trim()) { setExtractError("Conteúdo vazio."); return; }

    setIsExtracting(true);
    try {
      const res = await fetch("/api/admin/scrape/extract-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: scrapedText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.error ?? "Erro na extração com IA.");
      } else if (data.total === 0) {
        setExtractError(
          "Nenhuma questão de múltipla escolha completa encontrada. Use 'Ingerir como material de referência' para apostilas e artigos."
        );
      } else {
        setQuestions(
          (data.questions as ExtractedQuestion[]).map((q, i) => ({
            ...q,
            id: `q-${i}-${Date.now()}`,
            selected: true,
          }))
        );
      }
    } catch { setExtractError("Erro de conexão."); }
    finally { setIsExtracting(false); }
  }

  function updateQuestion(id: string, patch: Partial<ExtractedQuestion>) {
    setQuestions((prev) =>
      prev ? prev.map((q) => (q.id === id ? { ...q, ...patch } : q)) : prev
    );
  }

  function toggleQuestion(id: string) {
    setQuestions((prev) =>
      prev ? prev.map((q) => (q.id === id ? { ...q, selected: !q.selected } : q)) : prev
    );
  }

  function toggleAllQuestions() {
    if (!questions) return;
    const allSelected = questions.every((q) => q.selected);
    setQuestions(questions.map((q) => ({ ...q, selected: !allSelected })));
  }

  async function handleIngestQuestions() {
    setIngestError(null);
    setIngestResult(null);
    const selected = (questions ?? []).filter((q) => q.selected);
    if (selected.length === 0) { setIngestError("Selecione ao menos uma questão."); return; }

    setIsIngesting(true);
    try {
      const payload = selected.map((q) => ({
        stem: q.stem,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctAnswer: q.correctAnswer || undefined,
        descriptorCode: q.descriptorCode || undefined,
        difficulty: (q.difficulty as "facil" | "medio" | "dificil") || undefined,
        subjectSlug: subjectSlug || undefined,
        gradeLevelSlug: gradeLevelSlug || undefined,
        evaluationSlug: evaluationSlug || undefined,
      }));

      const res = await fetch("/api/admin/ingest/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: payload, sourceUrl: pageUrl }),
      });
      const data = await res.json();
      if (!res.ok) setIngestError(data.error ?? "Erro ao ingerir.");
      else setIngestResult(data);
    } catch { setIngestError("Erro de conexão."); }
    finally { setIsIngesting(false); }
  }

  async function handleIngestRaw() {
    setRawError(null);
    setRawResult(null);
    if (!scrapedText.trim()) { setRawError("Conteúdo vazio."); return; }

    setIsIngestingRaw(true);
    try {
      const formData = new FormData();
      formData.append("text", scrapedText);
      if (rawDescriptor) formData.append("descriptorCode", rawDescriptor);
      if (rawSubject) formData.append("subjectSlug", rawSubject);
      if (rawGrade) formData.append("gradeLevelSlug", rawGrade);
      if (rawEvaluation) formData.append("evaluationSlug", rawEvaluation);
      if (rawDifficulty) formData.append("difficulty", rawDifficulty);

      const res = await fetch("/api/admin/ingest", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) setRawError(data.error ?? "Erro ao ingerir.");
      else setRawResult(`✓ ${data.chunksCreated} chunks criados com sucesso.`);
    } catch { setRawError("Erro de conexão."); }
    finally { setIsIngestingRaw(false); }
  }

  const hasContent = scrapedText.trim().length > 0;
  const selectedCount = (questions ?? []).filter((q) => q.selected).length;

  return (
    <div className="space-y-6">
      {/* Passo 1: Scrape */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">1. Extrair texto de página HTML</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Ideal para páginas cujo conteúdo das questões está escrito diretamente no HTML
          (não para páginas que são listas de links de download — use a aba de Arquivos).
        </p>
        <form onSubmit={handleScrape} className="space-y-4">
          <div>
            <Label htmlFor="html-url">URL da página</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="html-url"
                type="url"
                placeholder="https://exemplo.com/pagina-com-questoes"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isScraping}
                className="flex-1"
              />
              <Button type="submit" disabled={isScraping || !url.trim()}>
                {isScraping ? "Buscando..." : "Buscar conteúdo"}
              </Button>
            </div>
          </div>
          {scrapeError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
              {scrapeError}
            </div>
          )}
        </form>

        {hasContent && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{scrapedTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {wordCount?.toLocaleString("pt-BR")} palavras ·{" "}
                  {scrapedText.length.toLocaleString("pt-BR")} caracteres
                </p>
              </div>
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                ✓ Extraído
              </span>
            </div>
            <div>
              <Label>Pré-visualização (editável)</Label>
              <textarea
                className="mt-1 w-full h-36 rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                value={scrapedText}
                onChange={(e) => setScrapedText(e.target.value)}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Passo 2: Ações após extração — antes de mostrar questões */}
      {hasContent && !questions && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">2. O que fazer com este conteúdo?</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Use a <strong>extração por IA</strong> para páginas com questões de múltipla
            escolha — o gpt-4o identificará cada questão individualmente com seu descritor e
            dificuldade. Para apostilas, artigos ou matrizes de referência, use a{" "}
            <strong>ingestão como material de referência</strong>.
          </p>

          {extractError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800 text-sm mb-4">
              {extractError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleExtract} disabled={isExtracting} className="flex-1">
              {isExtracting ? "Extraindo com IA (gpt-4o)…" : "✦ Extrair questões com IA"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowRawIngest((v) => !v)}
              className="flex-1"
            >
              {showRawIngest ? "Ocultar" : "Ingerir como material de referência"}
            </Button>
          </div>

          {isExtracting && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              Analisando o texto e identificando questões de múltipla escolha… pode levar alguns segundos.
            </p>
          )}

          {/* Fluxo alternativo: texto bruto */}
          {showRawIngest && (
            <div className="mt-6 space-y-4 border-t pt-5">
              <p className="text-sm text-muted-foreground">
                O texto será dividido em chunks por tamanho e vetorizado como material de
                referência. Toda a ingestão compartilhará a mesma metadata abaixo.
              </p>
              <MetadataFields
                evaluationSlug={rawEvaluation} setEvaluationSlug={setRawEvaluation}
                subjectSlug={rawSubject} setSubjectSlug={setRawSubject}
                gradeLevelSlug={rawGrade} setGradeLevelSlug={setRawGrade}
                difficulty={rawDifficulty} setDifficulty={setRawDifficulty}
                descriptorCode={rawDescriptor} setDescriptorCode={setRawDescriptor}
              />
              {rawResult && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-green-800 text-sm">
                  {rawResult}
                </div>
              )}
              {rawError && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
                  {rawError}
                </div>
              )}
              <Button onClick={handleIngestRaw} disabled={isIngestingRaw} className="w-full">
                {isIngestingRaw ? "Indexando…" : "Ingerir texto no RAG"}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Passo 3: Revisão e ingestão de questões extraídas */}
      {questions && (
        <Card className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {questions.length} questão{questions.length !== 1 ? "ões" : ""} extraída
                {questions.length !== 1 ? "s" : ""} pela IA
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ajuste o <strong>descritor</strong>, <strong>dificuldade</strong> e{" "}
                <strong>gabarito</strong> de cada questão diretamente no card.
                Desmarque questões que não devem ser indexadas.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => { setQuestions(null); setExtractError(null); setIngestResult(null); }}
            >
              Refazer extração
            </Button>
          </div>

          {/* Metadata global */}
          <div className="rounded-md bg-muted/40 border p-4 space-y-3">
            <p className="text-sm font-medium">
              Metadata global — aplica a todas as questões selecionadas:
            </p>
            <GlobalMetadata
              evaluationSlug={evaluationSlug} setEvaluationSlug={setEvaluationSlug}
              subjectSlug={subjectSlug} setSubjectSlug={setSubjectSlug}
              gradeLevelSlug={gradeLevelSlug} setGradeLevelSlug={setGradeLevelSlug}
            />
          </div>

          <Separator />

          {/* Seleção em massa */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selectedCount} de {questions.length} selecionada{selectedCount !== 1 ? "s" : ""}
            </span>
            <button onClick={toggleAllQuestions} className="text-blue-600 hover:underline text-xs">
              {selectedCount === questions.length ? "Desmarcar todas" : "Selecionar todas"}
            </button>
          </div>

          {/* Cards de questões */}
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
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

          {ingestResult && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-green-800 text-sm">
              ✓{" "}
              {ingestResult.inserted} questão{ingestResult.inserted !== 1 ? "ões" : ""} indexada
              {ingestResult.inserted !== 1 ? "s" : ""} no RAG
              {ingestResult.failed > 0 && (
                <span className="text-orange-700"> · {ingestResult.failed} falhou</span>
              )}
            </div>
          )}
          {ingestError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
              {ingestError}
            </div>
          )}

          <Button
            onClick={handleIngestQuestions}
            disabled={isIngesting || selectedCount === 0}
            className="w-full"
          >
            {isIngesting
              ? `Indexando ${selectedCount} questão${selectedCount !== 1 ? "ões" : ""}…`
              : `Ingerir ${selectedCount} questão${selectedCount !== 1 ? "ões" : ""} no RAG`}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Cada questão será um chunk individual com seu próprio descritor e dificuldade.
          </p>
        </Card>
      )}
    </div>
  );
}

// ─── Aba 2: Scraping em Lote de Arquivos ──────────────────────────────────────

function BatchFileScrapingTab() {
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [foundFiles, setFoundFiles] = useState<FoundFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [pageUrl, setPageUrl] = useState("");

  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [descriptorCode, setDescriptorCode] = useState("");

  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<IngestFileResult[] | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const [sources, setSources] = useState<ScrapedSource[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    setIsLoadingSources(true);
    try {
      const res = await fetch("/api/admin/scrape-files");
      if (res.ok) setSources(await res.json());
    } finally {
      setIsLoadingSources(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  async function handleScan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setScanError(null);
    setFoundFiles([]);
    setSelectedFiles(new Set());
    setIngestResults(null);
    if (!url.trim()) { setScanError("Digite uma URL válida."); return; }

    setIsScanning(true);
    try {
      const res = await fetch("/api/admin/scrape-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Erro ao escanear página.");
      } else {
        setFoundFiles(data.files);
        setPageUrl(data.pageUrl);
        if (data.files.length === 0)
          setScanError("Nenhum arquivo PDF, DOCX ou TXT encontrado nesta página.");
        else setSelectedFiles(new Set(data.files.map((f: FoundFile) => f.url)));
      }
    } catch { setScanError("Erro de conexão."); }
    finally { setIsScanning(false); }
  }

  function toggleFile(fileUrl: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileUrl)) next.delete(fileUrl);
      else next.add(fileUrl);
      return next;
    });
  }

  function toggleAll() {
    if (selectedFiles.size === foundFiles.length) setSelectedFiles(new Set());
    else setSelectedFiles(new Set(foundFiles.map((f) => f.url)));
  }

  async function handleIngest() {
    setIngestResults(null);
    setIngestError(null);
    const filesToIngest = foundFiles.filter((f) => selectedFiles.has(f.url));
    if (filesToIngest.length === 0) { setIngestError("Selecione ao menos um arquivo."); return; }

    setIsIngesting(true);
    try {
      const res = await fetch("/api/admin/scrape-files/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl,
          files: filesToIngest,
          metadata: {
            descriptorCode: descriptorCode || undefined,
            subjectSlug: subjectSlug || undefined,
            gradeLevelSlug: gradeLevelSlug || undefined,
            evaluationSlug: evaluationSlug || undefined,
            difficulty: difficulty || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) setIngestError(data.error ?? "Erro ao ingerir arquivos.");
      else {
        setIngestResults(data.results);
        await loadSources();
      }
    } catch { setIngestError("Erro de conexão ao ingerir."); }
    finally { setIsIngesting(false); }
  }

  async function handleDeleteSource(id: string) {
    if (!confirm("Remover esta fonte e seus chunks do RAG?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/scrape-files?id=${id}`, { method: "DELETE" });
      if (res.ok) await loadSources();
    } finally { setDeletingId(null); }
  }

  const hasFiles = foundFiles.length > 0;
  const selectedCount = selectedFiles.size;

  return (
    <div className="space-y-6">
      {/* Scanner */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">1. Escanear página para arquivos</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Cole a URL de uma página que contenha links para download de provas em PDF ou DOCX.
        </p>
        <form onSubmit={handleScan} className="space-y-4">
          <div>
            <Label htmlFor="batch-url">URL da página</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="batch-url"
                type="url"
                placeholder="https://blog.exemplo.com/simulados"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isScanning}
                className="flex-1"
              />
              <Button type="submit" disabled={isScanning || !url.trim()}>
                {isScanning ? "Escaneando..." : "Buscar arquivos"}
              </Button>
            </div>
          </div>
          {scanError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
              {scanError}
            </div>
          )}
        </form>

        {hasFiles && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">
                {foundFiles.length} arquivo{foundFiles.length !== 1 ? "s" : ""} encontrado
                {foundFiles.length !== 1 ? "s" : ""}
              </p>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                {selectedCount === foundFiles.length ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {foundFiles.map((file) => (
                <label
                  key={file.url}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    selectedFiles.has(file.url)
                      ? "bg-blue-50 border-blue-200"
                      : "bg-background border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.url)}
                    onChange={() => toggleFile(file.url)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.filename}</p>
                    <p className="text-xs text-muted-foreground truncate">{file.url}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${typeBadgeColor(file.type)}`}>
                    {file.type.toUpperCase()}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Metadados e ingestão */}
      {hasFiles && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">2. Configurar metadados</h2>
          <p className="text-sm text-muted-foreground mb-4">
            A mesma metadata será aplicada a todos os{" "}
            <strong>{selectedCount}</strong> arquivo{selectedCount !== 1 ? "s" : ""} selecionado
            {selectedCount !== 1 ? "s" : ""}.
          </p>
          <MetadataFields
            evaluationSlug={evaluationSlug} setEvaluationSlug={setEvaluationSlug}
            subjectSlug={subjectSlug} setSubjectSlug={setSubjectSlug}
            gradeLevelSlug={gradeLevelSlug} setGradeLevelSlug={setGradeLevelSlug}
            difficulty={difficulty} setDifficulty={setDifficulty}
            descriptorCode={descriptorCode} setDescriptorCode={setDescriptorCode}
          />
          <Separator className="my-6" />

          {ingestError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm mb-4">
              {ingestError}
            </div>
          )}

          {ingestResults && (
            <div className="mb-4 space-y-2">
              {ingestResults.map((r) => (
                <div
                  key={r.url}
                  className={`flex items-center justify-between p-3 rounded-md border text-sm ${
                    r.status === "success"
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.filename}</p>
                    {r.status === "error" && <p className="text-xs mt-0.5">{r.error}</p>}
                  </div>
                  <div className="ml-3 text-right shrink-0">
                    {r.status === "success" ? (
                      <span>✓ {r.chunksCreated} chunks{r.fileSize ? ` · ${formatBytes(r.fileSize)}` : ""}</span>
                    ) : (
                      <span>✗ Falhou</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleIngest}
            disabled={isIngesting || selectedCount === 0}
            className="w-full"
          >
            {isIngesting
              ? `Baixando e indexando ${selectedCount} arquivo${selectedCount !== 1 ? "s" : ""}...`
              : `Baixar e ingerir ${selectedCount} arquivo${selectedCount !== 1 ? "s" : ""} no RAG`}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Os arquivos serão baixados, salvos localmente para rastreio e indexados no banco vetorizado.
          </p>
        </Card>
      )}

      {/* Histórico */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Histórico de arquivos ingeridos</h2>
            <p className="text-sm text-muted-foreground">Rastreio de todas as provas baixadas e indexadas.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadSources} disabled={isLoadingSources}>
            {isLoadingSources ? "..." : "Atualizar"}
          </Button>
        </div>

        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum arquivo ingerido ainda. Use o scanner acima para começar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left font-medium pb-2 pr-4">Arquivo</th>
                  <th className="text-left font-medium pb-2 pr-4">Tipo</th>
                  <th className="text-left font-medium pb-2 pr-4">Chunks</th>
                  <th className="text-left font-medium pb-2 pr-4">Metadata</th>
                  <th className="text-left font-medium pb-2 pr-4">Data</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sources.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="py-3 pr-4">
                      <div>
                        <a
                          href={s.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline text-blue-600 truncate block max-w-[200px]"
                          title={s.fileName}
                        >
                          {s.fileName}
                        </a>
                        <p
                          className="text-xs text-muted-foreground truncate max-w-[200px]"
                          title={s.pageUrl}
                        >
                          {s.pageUrl}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${typeBadgeColor(s.fileType)}`}>
                        {s.fileType.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-medium">{s.chunksCreated}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {s.evaluationSlug && <Badge variant="outline" className="text-xs">{s.evaluationSlug}</Badge>}
                        {s.subjectSlug && <Badge variant="outline" className="text-xs">{s.subjectSlug}</Badge>}
                        {s.gradeLevelSlug && <Badge variant="outline" className="text-xs">{s.gradeLevelSlug}</Badge>}
                        {s.descriptorCode && <Badge variant="outline" className="text-xs">{s.descriptorCode}</Badge>}
                        {s.difficulty && <Badge variant="outline" className="text-xs">{s.difficulty}</Badge>}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteSource(s.id)}
                        disabled={deletingId === s.id}
                      >
                        {deletingId === s.id ? "..." : "Remover"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">
              Total: {sources.length} arquivo{sources.length !== 1 ? "s" : ""} ·{" "}
              {sources.reduce((a, s) => a + s.chunksCreated, 0)} chunks indexados
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function ScrapingPage() {
  const [activeTab, setActiveTab] = useState<"html" | "files">("files");

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Scraping Web</h1>
      <p className="text-muted-foreground mb-6">
        Extraia conteúdo de páginas web e arquivos para enriquecer a base de conhecimento RAG.
      </p>

      <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6 w-fit">
        <button
          onClick={() => setActiveTab("files")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "files"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Scraping de Arquivos (PDF/DOCX)
        </button>
        <button
          onClick={() => setActiveTab("html")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "html"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Scraping de Texto HTML
        </button>
      </div>

      {activeTab === "files" ? <BatchFileScrapingTab /> : <HtmlScrapingTab />}
    </div>
  );
}
