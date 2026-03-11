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
import {
  QuestionCard,
  type ExtractedQuestion,
  type ExtractedQuestionUI,
} from "@/components/admin/question-card";
import { GlobalMetadata } from "@/components/admin/global-metadata";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FoundFile {
  url: string;
  filename: string;
  type: "pdf" | "docx" | "txt";
  alreadyProcessed?: boolean;
  previousStatus?: string | null;
  questionsFound?: number | null;
  answerKey?: string | null;
}

interface BatchFileStatus {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  status: string;
  questionsFound: number;
  questionsIngested: number;
  errorMessage: string | null;
  alreadyDone: boolean;
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

// ─── Metadata completa — para ingestao de texto bruto ─────────────────────────

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
        <Label>Avaliacao</Label>
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
            <SelectItem value="matematica">Matematica</SelectItem>
            <SelectItem value="portugues">Lingua Portuguesa</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Serie</Label>
        <Select onValueChange={setGradeLevelSlug} value={gradeLevelSlug}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="5_ano">5o ano</SelectItem>
            <SelectItem value="9_ano">9o ano</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Dificuldade</Label>
        <Select onValueChange={setDifficulty} value={difficulty}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="facil">Facil</SelectItem>
            <SelectItem value="medio">Medio</SelectItem>
            <SelectItem value="dificil">Dificil</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Label>Codigo do Descritor (opcional)</Label>
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

// ─── Aba 1: Scraping de Texto HTML ────────────────────────────────────────────

function HtmlScrapingTab() {
  const [url, setUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapedTitle, setScrapedTitle] = useState<string | null>(null);
  const [scrapedText, setScrapedText] = useState("");
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [pageUrl, setPageUrl] = useState("");

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExtractedQuestionUI[] | null>(null);

  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");

  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ inserted: number; failed: number } | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

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
    if (!url.trim()) { setScrapeError("Digite uma URL valida."); return; }

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
    } catch { setScrapeError("Erro de conexao."); }
    finally { setIsScraping(false); }
  }

  async function handleExtract() {
    setExtractError(null);
    setQuestions(null);
    setIngestResult(null);
    setIngestError(null);
    if (!scrapedText.trim()) { setExtractError("Conteudo vazio."); return; }

    setIsExtracting(true);
    try {
      const res = await fetch("/api/admin/scrape/extract-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: scrapedText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.error ?? "Erro na extracao com IA.");
      } else if (data.total === 0) {
        setExtractError(
          "Nenhuma questao de multipla escolha completa encontrada. Use 'Ingerir como material de referencia' para apostilas e artigos."
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
    } catch { setExtractError("Erro de conexao."); }
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
    if (selected.length === 0) { setIngestError("Selecione ao menos uma questao."); return; }

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
    } catch { setIngestError("Erro de conexao."); }
    finally { setIsIngesting(false); }
  }

  async function handleIngestRaw() {
    setRawError(null);
    setRawResult(null);
    if (!scrapedText.trim()) { setRawError("Conteudo vazio."); return; }

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
      else setRawResult(`${data.chunksCreated} chunks criados com sucesso.`);
    } catch { setRawError("Erro de conexao."); }
    finally { setIsIngestingRaw(false); }
  }

  const hasContent = scrapedText.trim().length > 0;
  const selectedCount = (questions ?? []).filter((q) => q.selected).length;

  return (
    <div className="space-y-6">
      {/* Passo 1: Scrape */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">1. Extrair texto de pagina HTML</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Ideal para paginas cujo conteudo das questoes esta escrito diretamente no HTML
          (nao para paginas que sao listas de links de download — use a aba de Arquivos).
        </p>
        <form onSubmit={handleScrape} className="space-y-4">
          <div>
            <Label htmlFor="html-url">URL da pagina</Label>
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
                {isScraping ? "Buscando..." : "Buscar conteudo"}
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
                Extraido
              </span>
            </div>
            <div>
              <Label>Pre-visualizacao (editavel)</Label>
              <textarea
                className="mt-1 w-full h-36 rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                value={scrapedText}
                onChange={(e) => setScrapedText(e.target.value)}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Passo 2: Acoes apos extracao */}
      {hasContent && !questions && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">2. O que fazer com este conteudo?</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Use a <strong>extracao por IA</strong> para paginas com questoes de multipla
            escolha. Para apostilas, artigos ou matrizes de referencia, use a{" "}
            <strong>ingestao como material de referencia</strong>.
          </p>

          {extractError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800 text-sm mb-4">
              {extractError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleExtract} disabled={isExtracting} className="flex-1">
              {isExtracting ? "Extraindo com IA (gpt-4o)..." : "Extrair questoes com IA"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowRawIngest((v) => !v)}
              className="flex-1"
            >
              {showRawIngest ? "Ocultar" : "Ingerir como material de referencia"}
            </Button>
          </div>

          {isExtracting && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              Analisando o texto e identificando questoes de multipla escolha... pode levar alguns segundos.
            </p>
          )}

          {showRawIngest && (
            <div className="mt-6 space-y-4 border-t pt-5">
              <p className="text-sm text-muted-foreground">
                O texto sera dividido em chunks por tamanho e vetorizado como material de
                referencia. Toda a ingestao compartilhara a mesma metadata abaixo.
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
                {isIngestingRaw ? "Indexando..." : "Ingerir texto no RAG"}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Passo 3: Revisao e ingestao de questoes extraidas */}
      {questions && (
        <Card className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {questions.length} questao(oes) extraida(s) pela IA
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ajuste o <strong>descritor</strong>, <strong>dificuldade</strong> e{" "}
                <strong>gabarito</strong> de cada questao diretamente no card.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => { setQuestions(null); setExtractError(null); setIngestResult(null); }}
            >
              Refazer extracao
            </Button>
          </div>

          <div className="rounded-md bg-muted/40 border p-4 space-y-3">
            <p className="text-sm font-medium">
              Metadata global — aplica a todas as questoes selecionadas:
            </p>
            <GlobalMetadata
              evaluationSlug={evaluationSlug} setEvaluationSlug={setEvaluationSlug}
              subjectSlug={subjectSlug} setSubjectSlug={setSubjectSlug}
              gradeLevelSlug={gradeLevelSlug} setGradeLevelSlug={setGradeLevelSlug}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selectedCount} de {questions.length} selecionada(s)
            </span>
            <button onClick={toggleAllQuestions} className="text-blue-600 hover:underline text-xs">
              {selectedCount === questions.length ? "Desmarcar todas" : "Selecionar todas"}
            </button>
          </div>

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
              {ingestResult.inserted} questao(oes) indexada(s) no RAG
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
              ? `Indexando ${selectedCount} questao(oes)...`
              : `Ingerir ${selectedCount} questao(oes) no RAG`}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Cada questao sera um chunk individual com seu proprio descritor e dificuldade.
          </p>
        </Card>
      )}
    </div>
  );
}

// ─── Aba 2: Scraping em Lote de Arquivos ──────────────────────────────────────

function BatchFileScrapingTab() {
  // Passo 1 — scan
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [foundFiles, setFoundFiles] = useState<FoundFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [pageUrl, setPageUrl] = useState("");

  // Metadata global
  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");

  // Batch state
  const [, setBatchId] = useState<string | null>(null);
  const [batchFiles, setBatchFiles] = useState<BatchFileStatus[]>([]);

  // Resume banner
  const [resumeBanner, setResumeBanner] = useState<{
    batchId: string;
    pending: number;
    extracted: number;
    total: number;
  } | null>(null);

  // Smart extraction state
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExtractedQuestionUI[] | null>(null);

  // Question ingestion
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ inserted: number; failed: number } | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Raw ingest (existing behavior)
  const [isIngestingRaw, setIsIngestingRaw] = useState(false);
  const [ingestResults, setIngestResults] = useState<IngestFileResult[] | null>(null);
  const [ingestRawError, setIngestRawError] = useState<string | null>(null);

  // History
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

  // Resume-on-mount: check localStorage for pending batch
  useEffect(() => {
    async function checkResumeBatch() {
      const savedBatchId = localStorage.getItem("scraping_batchId");
      if (!savedBatchId) return;

      try {
        const res = await fetch(`/api/admin/scrape-files/batch/${savedBatchId}`);
        if (!res.ok) {
          localStorage.removeItem("scraping_batchId");
          return;
        }
        const data = await res.json();
        const files = data.files as BatchFileStatus[];
        const pending = files.filter((f) => f.status === "pending").length;
        const extracted = files.filter((f) => f.status === "extracted").length;

        if (pending > 0 || extracted > 0) {
          setResumeBanner({
            batchId: savedBatchId,
            pending,
            extracted,
            total: files.length,
          });
        } else {
          localStorage.removeItem("scraping_batchId");
        }
      } catch {
        localStorage.removeItem("scraping_batchId");
      }
    }
    checkResumeBatch();
  }, []);

  async function handleResumeBatch() {
    if (!resumeBanner) return;
    const savedBatchId = resumeBanner.batchId;
    setResumeBanner(null);

    try {
      const res = await fetch(`/api/admin/scrape-files/batch/${savedBatchId}`);
      if (!res.ok) return;
      const data = await res.json();
      const files = data.files as BatchFileStatus[];

      setBatchId(savedBatchId);
      setBatchFiles(files);

      const pendingFiles = files.filter((f) => f.status === "pending");

      if (pendingFiles.length > 0) {
        // Resume extraction for pending files
        setIsExtracting(true);
        try {
          for (let i = 0; i < pendingFiles.length; i++) {
            const file = pendingFiles[i];
            setExtractProgress(
              `Retomando arquivo ${i + 1} de ${pendingFiles.length}: ${file.fileName}...`
            );

            try {
              await fetch("/api/admin/scrape-files/extract-questions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: file.fileUrl,
                  filename: file.fileName,
                  type: file.fileType,
                  sourceId: file.id,
                }),
              });

              // Refresh batch status
              const statusRes = await fetch(`/api/admin/scrape-files/batch/${savedBatchId}`);
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                setBatchFiles(statusData.files);
              }
            } catch {
              // Skip failed files
            }
          }
        } finally {
          setIsExtracting(false);
          setExtractProgress(null);
        }
      }

      // Fetch all questions from batch
      const qRes = await fetch(`/api/admin/scrape-files/batch/${savedBatchId}/questions`);
      if (qRes.ok) {
        const qData = await qRes.json();
        if (qData.questions && qData.questions.length > 0) {
          const mapped: ExtractedQuestionUI[] = qData.questions.map(
            (q: ExtractedQuestion & { sourceId?: string; fileName?: string }, i: number) => ({
              ...q,
              id: `q-${i}-${Date.now()}`,
              selected: true,
              sourceId: q.sourceId,
            })
          );
          setQuestions(mapped);
        } else {
          setExtractError("Nenhuma questao encontrada no batch retomado.");
        }
      }
    } catch {
      setExtractError("Erro ao retomar batch.");
    }
  }

  function handleDismissResume() {
    localStorage.removeItem("scraping_batchId");
    setResumeBanner(null);
  }

  async function handleScan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setScanError(null);
    setFoundFiles([]);
    setSelectedFiles(new Set());
    setIngestResults(null);
    setQuestions(null);
    setExtractError(null);
    setIngestResult(null);
    if (!url.trim()) { setScanError("Digite uma URL valida."); return; }

    setIsScanning(true);
    try {
      const res = await fetch("/api/admin/scrape-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Erro ao escanear pagina.");
      } else {
        setFoundFiles(data.files);
        setPageUrl(data.pageUrl);
        if (data.files.length === 0)
          setScanError("Nenhum arquivo PDF, DOCX ou TXT encontrado nesta pagina.");
        else {
          // By default select only files that are NOT already processed
          const notProcessed = (data.files as FoundFile[]).filter((f) => !f.alreadyProcessed);
          setSelectedFiles(new Set(notProcessed.map((f) => f.url)));
        }
      }
    } catch { setScanError("Erro de conexao."); }
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

  // ─── Smart: Extrair questoes com IA ─────────────────────────────────────────

  async function handleExtractQuestions() {
    setExtractError(null);
    setQuestions(null);
    setIngestResult(null);
    setIngestError(null);

    const filesToProcess = foundFiles.filter((f) => selectedFiles.has(f.url));
    if (filesToProcess.length === 0) {
      setExtractError("Selecione ao menos um arquivo.");
      return;
    }

    setIsExtracting(true);

    try {
      // Step 1: Create batch
      const batchRes = await fetch("/api/admin/scrape-files/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl,
          files: filesToProcess.map((f) => ({
            url: f.url,
            filename: f.filename,
            type: f.type,
          })),
          metadata: {
            subjectSlug: subjectSlug || undefined,
            gradeLevelSlug: gradeLevelSlug || undefined,
            evaluationSlug: evaluationSlug || undefined,
          },
        }),
      });
      const batchData = await batchRes.json();
      if (!batchRes.ok) {
        setExtractError(batchData.error ?? "Erro ao criar batch.");
        return;
      }

      const newBatchId = batchData.batchId as string;
      const batchFileList = batchData.files as BatchFileStatus[];
      setBatchId(newBatchId);
      setBatchFiles(batchFileList);
      localStorage.setItem("scraping_batchId", newBatchId);

      // Step 2: For each pending file, call extract-questions with sourceId
      // Criar mapa de answerKey por URL para correlacionar com batch files
      const answerKeyMap = new Map<string, string>();
      for (const f of filesToProcess) {
        if (f.answerKey) answerKeyMap.set(f.url, f.answerKey);
      }

      const pendingFiles = batchFileList.filter((f) => !f.alreadyDone);

      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        setExtractProgress(
          `Processando arquivo ${i + 1} de ${pendingFiles.length}: ${file.fileName}...`
        );

        try {
          await fetch("/api/admin/scrape-files/extract-questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: file.fileUrl,
              filename: file.fileName,
              type: file.fileType,
              sourceId: file.id,
              answerKey: answerKeyMap.get(file.fileUrl) || undefined,
            }),
          });

          // Refresh batch status after each file
          const statusRes = await fetch(`/api/admin/scrape-files/batch/${newBatchId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setBatchFiles(statusData.files);
          }
        } catch {
          // Skip failed files
        }
      }

      // Step 3: Fetch all questions from batch
      const qRes = await fetch(`/api/admin/scrape-files/batch/${newBatchId}/questions`);
      if (!qRes.ok) {
        setExtractError("Erro ao buscar questoes do batch.");
        return;
      }
      const qData = await qRes.json();

      if (!qData.questions || qData.questions.length === 0) {
        setExtractError(
          "Nenhuma questao encontrada nos arquivos selecionados. Tente 'Ingerir como Texto Bruto'."
        );
      } else {
        const mapped: ExtractedQuestionUI[] = qData.questions.map(
          (q: ExtractedQuestion & { sourceId?: string; fileName?: string }, i: number) => ({
            ...q,
            id: `q-${i}-${Date.now()}`,
            selected: true,
            sourceId: q.sourceId,
          })
        );
        setQuestions(mapped);
      }
    } finally {
      setIsExtracting(false);
      setExtractProgress(null);
    }
  }

  // ─── Ingerir questoes extraidas ─────────────────────────────────────────────

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
      let totalInserted = 0;
      let totalFailed = 0;

      // Group questions by sourceId for tracking
      const bySource = new Map<string | undefined, (typeof selected)>();
      for (const q of selected) {
        const sid = (q as ExtractedQuestionUI & { sourceId?: string }).sourceId;
        if (!bySource.has(sid)) bySource.set(sid, []);
        bySource.get(sid)!.push(q);
      }

      for (const [sourceId, sourceQuestions] of bySource) {
        // Batch in groups of 200
        for (let i = 0; i < sourceQuestions.length; i += 200) {
          const batch = sourceQuestions.slice(i, i + 200);
          const payload = {
            questions: batch.map((q) => ({
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
              hasImage: q.hasImage || undefined,
              imageDescription: q.imageDescription || undefined,
              imageUrl: q.imageUrl || undefined,
            })),
            sourceId: sourceId || undefined,
            sourceFileName: `scrape-${pageUrl ? new URL(pageUrl).hostname : "batch"}`,
          };

          const res = await fetch("/api/admin/ingest/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (res.ok) {
            totalInserted += data.inserted ?? 0;
            totalFailed += data.failed ?? 0;
          } else {
            totalFailed += batch.length;
          }
        }
      }

      setIngestResult({ inserted: totalInserted, failed: totalFailed });

      // Clear batchId from localStorage after successful ingestion
      if (totalInserted > 0) {
        localStorage.removeItem("scraping_batchId");
        setBatchId(null);
        setBatchFiles([]);
      }
    } catch {
      setIngestError("Erro de conexao. Tente novamente.");
    } finally {
      setIsIngesting(false);
    }
  }

  // ─── Raw: Ingerir como texto bruto ──────────────────────────────────────────

  async function handleIngestRaw() {
    setIngestResults(null);
    setIngestRawError(null);
    const filesToIngest = foundFiles.filter((f) => selectedFiles.has(f.url));
    if (filesToIngest.length === 0) { setIngestRawError("Selecione ao menos um arquivo."); return; }

    setIsIngestingRaw(true);
    try {
      const res = await fetch("/api/admin/scrape-files/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl,
          files: filesToIngest,
          metadata: {
            subjectSlug: subjectSlug || undefined,
            gradeLevelSlug: gradeLevelSlug || undefined,
            evaluationSlug: evaluationSlug || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) setIngestRawError(data.error ?? "Erro ao ingerir arquivos.");
      else {
        setIngestResults(data.results);
        await loadSources();
      }
    } catch { setIngestRawError("Erro de conexao ao ingerir."); }
    finally { setIsIngestingRaw(false); }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

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

  function selectAllQuestions(val: boolean) {
    setQuestions((prev) => prev ? prev.map((q) => ({ ...q, selected: val })) : prev);
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
  const selectedFileCount = selectedFiles.size;
  const selectedQuestionCount = (questions ?? []).filter((q) => q.selected).length;

  return (
    <div className="space-y-6">
      {/* Resume banner */}
      {resumeBanner && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-900">
                Batch anterior encontrado com {resumeBanner.pending} arquivo(s) pendente(s)
                {resumeBanner.extracted > 0 && ` e ${resumeBanner.extracted} com questoes extraidas`}
                {" "}(total: {resumeBanner.total})
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Deseja retomar o processamento?
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={handleResumeBatch}>
                Retomar
              </Button>
              <Button size="sm" variant="outline" onClick={handleDismissResume}>
                Descartar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Scanner */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">1. Escanear pagina para arquivos</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Cole a URL de uma pagina que contenha links para download de provas em PDF ou DOCX.
        </p>
        <form onSubmit={handleScan} className="space-y-4">
          <div>
            <Label htmlFor="batch-url">URL da pagina</Label>
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
                {foundFiles.length} arquivo(s) encontrado(s)
              </p>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                {selectedFileCount === foundFiles.length ? "Desmarcar todos" : "Selecionar todos"}
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{file.filename}</p>
                      {file.alreadyProcessed && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded border bg-green-100 text-green-700 border-green-200 shrink-0">
                          Ja extraido{file.questionsFound != null ? ` (${file.questionsFound} questoes)` : ""}
                        </span>
                      )}
                      {!file.alreadyProcessed && file.previousStatus === "extracted" && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded border bg-yellow-100 text-yellow-700 border-yellow-200 shrink-0">
                          Questoes pendentes
                        </span>
                      )}
                      {file.answerKey && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded border bg-purple-100 text-purple-700 border-purple-200 shrink-0">
                          Gabarito detectado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{file.url}</p>
                    {file.answerKey && (
                      <p className="text-xs text-purple-600 mt-0.5 truncate" title={file.answerKey}>
                        Gabarito: {file.answerKey.length > 60 ? file.answerKey.slice(0, 60) + "..." : file.answerKey}
                      </p>
                    )}
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

      {/* Metadados e acoes */}
      {hasFiles && !questions && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-1">2. Configurar metadados e processar</h2>
          <p className="text-sm text-muted-foreground">
            Metadata global aplicada a todos os {selectedFileCount} arquivo(s) selecionado(s).
          </p>

          <GlobalMetadata
            evaluationSlug={evaluationSlug} setEvaluationSlug={setEvaluationSlug}
            subjectSlug={subjectSlug} setSubjectSlug={setSubjectSlug}
            gradeLevelSlug={gradeLevelSlug} setGradeLevelSlug={setGradeLevelSlug}
          />

          <Separator />

          {extractError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
              {extractError}
            </div>
          )}
          {ingestRawError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
              {ingestRawError}
            </div>
          )}

          {extractProgress && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-blue-800 text-sm">
              {extractProgress}
            </div>
          )}

          {batchFiles.length > 0 && isExtracting && (
            <div className="space-y-1">
              {batchFiles.map((bf) => (
                <div
                  key={bf.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-md border text-xs ${
                    bf.status === "extracted"
                      ? "bg-green-50 border-green-200 text-green-800"
                      : bf.status === "error"
                        ? "bg-red-50 border-red-200 text-red-800"
                        : bf.alreadyDone
                          ? "bg-gray-50 border-gray-200 text-gray-600"
                          : "bg-muted/30 border-border text-muted-foreground"
                  }`}
                >
                  <span className="truncate">{bf.fileName}</span>
                  <span className="shrink-0 ml-2 font-medium">
                    {bf.alreadyDone
                      ? `Ja feito (${bf.questionsFound}q)`
                      : bf.status === "extracted"
                        ? `${bf.questionsFound} questoes`
                        : bf.status === "error"
                          ? bf.errorMessage ?? "Erro"
                          : "Pendente"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {ingestResults && (
            <div className="space-y-2">
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
                      <span>{r.chunksCreated} chunks{r.fileSize ? ` · ${formatBytes(r.fileSize)}` : ""}</span>
                    ) : (
                      <span>Falhou</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleExtractQuestions}
              disabled={isExtracting || isIngestingRaw || selectedFileCount === 0}
              className="flex-1"
            >
              {isExtracting
                ? "Extraindo questoes com IA..."
                : `Extrair questoes com IA (${selectedFileCount} arquivo(s))`}
            </Button>
            <Button
              variant="outline"
              onClick={handleIngestRaw}
              disabled={isExtracting || isIngestingRaw || selectedFileCount === 0}
            >
              {isIngestingRaw
                ? "Indexando..."
                : "Ingerir como texto bruto"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            A extracao com IA identifica cada questao com seu descritor e dificuldade individuais.
          </p>
        </Card>
      )}

      {/* Questoes extraidas */}
      {questions && (
        <Card className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {questions.length} questao(oes) extraida(s) dos arquivos
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ajuste o <strong>descritor</strong>, <strong>dificuldade</strong> e{" "}
                <strong>gabarito</strong> de cada questao.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setQuestions(null);
                setExtractError(null);
                setIngestResult(null);
                setIngestError(null);
              }}
            >
              Voltar
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selectedQuestionCount} de {questions.length} selecionada(s)
            </span>
            <div className="flex gap-2">
              <button onClick={() => selectAllQuestions(true)} className="text-blue-600 hover:underline text-xs">
                Selecionar todas
              </button>
              <button onClick={() => selectAllQuestions(false)} className="text-blue-600 hover:underline text-xs">
                Desmarcar todas
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
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
              {ingestResult.inserted} questao(oes) indexada(s) no RAG
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
            disabled={isIngesting || selectedQuestionCount === 0}
            className="w-full"
          >
            {isIngesting
              ? `Indexando ${selectedQuestionCount} questao(oes)...`
              : `Ingerir ${selectedQuestionCount} questao(oes) no RAG`}
          </Button>
        </Card>
      )}

      {/* Historico */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Historico de arquivos ingeridos</h2>
            <p className="text-sm text-muted-foreground">Rastreio de todas as provas baixadas e indexadas.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadSources} disabled={isLoadingSources}>
            {isLoadingSources ? "..." : "Atualizar"}
          </Button>
        </div>

        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum arquivo ingerido ainda. Use o scanner acima para comecar.
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
              Total: {sources.length} arquivo(s) ·{" "}
              {sources.reduce((a, s) => a + s.chunksCreated, 0)} chunks indexados
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Pagina Principal ─────────────────────────────────────────────────────────

export default function ScrapingPage() {
  const [activeTab, setActiveTab] = useState<"html" | "files">("files");

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Scraping Web</h1>
      <p className="text-muted-foreground mb-6">
        Extraia conteudo de paginas web e arquivos para enriquecer a base de conhecimento RAG.
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
