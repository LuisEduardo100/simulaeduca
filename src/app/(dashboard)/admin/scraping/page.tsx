"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export default function ScrapingPage() {
  // Etapa 1 — scraping
  const [url, setUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapedTitle, setScrapedTitle] = useState<string | null>(null);
  const [scrapedText, setScrapedText] = useState<string>("");
  const [wordCount, setWordCount] = useState<number | null>(null);

  // Etapa 2 — metadados e ingestão
  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [descriptorCode, setDescriptorCode] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    setScrapeError(null);
    setScrapedText("");
    setScrapedTitle(null);
    setWordCount(null);
    setIngestResult(null);
    setIngestError(null);

    if (!url.trim()) {
      setScrapeError("Digite uma URL válida.");
      return;
    }

    setIsScraping(true);
    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setScrapeError(data.error ?? "Erro ao fazer scraping.");
      } else {
        setScrapedTitle(data.title);
        setScrapedText(data.text);
        setWordCount(data.wordCount);
      }
    } catch {
      setScrapeError("Erro de conexão. Verifique a URL e tente novamente.");
    } finally {
      setIsScraping(false);
    }
  }

  async function handleIngest() {
    setIngestResult(null);
    setIngestError(null);

    if (!scrapedText.trim()) {
      setIngestError("O conteúdo extraído está vazio.");
      return;
    }

    setIsIngesting(true);
    try {
      const formData = new FormData();
      formData.append("text", scrapedText);
      if (descriptorCode) formData.append("descriptorCode", descriptorCode);
      if (subjectSlug) formData.append("subjectSlug", subjectSlug);
      if (gradeLevelSlug) formData.append("gradeLevelSlug", gradeLevelSlug);
      if (evaluationSlug) formData.append("evaluationSlug", evaluationSlug);
      if (difficulty) formData.append("difficulty", difficulty);

      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setIngestError(data.error ?? "Erro ao ingerir material.");
      } else {
        setIngestResult(`✓ ${data.chunksCreated} chunks criados e indexados no RAG com sucesso!`);
        // Limpar após ingestão
        setUrl("");
        setScrapedText("");
        setScrapedTitle(null);
        setWordCount(null);
      }
    } catch {
      setIngestError("Erro de conexão ao ingerir. Tente novamente.");
    } finally {
      setIsIngesting(false);
    }
  }

  const hasContent = scrapedText.trim().length > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Scraping Web</h1>
      <p className="text-muted-foreground mb-8">
        Extraia conteúdo de páginas web e adicione à base de conhecimento RAG para enriquecer a geração de questões.
      </p>

      {/* Etapa 1: URL */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">1. Extrair conteúdo da web</h2>
        <form onSubmit={handleScrape} className="space-y-4">
          <div>
            <Label htmlFor="url">URL da página</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="url"
                type="url"
                placeholder="https://exemplo.com/matriz-de-referencia"
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

        {/* Resultado do scraping */}
        {hasContent && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{scrapedTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {wordCount?.toLocaleString("pt-BR")} palavras extraídas
                </p>
              </div>
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                ✓ Conteúdo extraído
              </div>
            </div>

            <div>
              <Label htmlFor="preview">Pré-visualização (editável antes de ingerir)</Label>
              <textarea
                id="preview"
                className="mt-1 w-full h-48 rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                value={scrapedText}
                onChange={(e) => setScrapedText(e.target.value)}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Etapa 2: Metadados e ingestão */}
      {hasContent && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">2. Configurar e ingerir no RAG</h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <Label htmlFor="evaluation">Avaliação</Label>
              <Select onValueChange={setEvaluationSlug} value={evaluationSlug}>
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
              <Label htmlFor="subject">Disciplina</Label>
              <Select onValueChange={setSubjectSlug} value={subjectSlug}>
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
              <Label htmlFor="gradeLevel">Série</Label>
              <Select onValueChange={setGradeLevelSlug} value={gradeLevelSlug}>
                <SelectTrigger id="gradeLevel" className="mt-1">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5_ano">5º ano</SelectItem>
                  <SelectItem value="9_ano">9º ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="difficulty">Dificuldade</Label>
              <Select onValueChange={setDifficulty} value={difficulty}>
                <SelectTrigger id="difficulty" className="mt-1">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facil">Fácil</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="dificil">Difícil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="descriptorCode">Código do Descritor (opcional)</Label>
              <Input
                id="descriptorCode"
                className="mt-1"
                placeholder="ex: D07"
                value={descriptorCode}
                onChange={(e) => setDescriptorCode(e.target.value.toUpperCase())}
                maxLength={5}
              />
            </div>
          </div>

          <Separator className="mb-6" />

          {ingestResult && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-green-800 text-sm mb-4">
              {ingestResult}
            </div>
          )}
          {ingestError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm mb-4">
              {ingestError}
            </div>
          )}

          <Button
            onClick={handleIngest}
            disabled={isIngesting || !scrapedText.trim()}
            className="w-full"
          >
            {isIngesting ? "Indexando no RAG..." : "Ingerir no RAG"}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            O texto será dividido em chunks, vetorizado e armazenado para enriquecer a geração de questões.
          </p>
        </Card>
      )}
    </div>
  );
}
