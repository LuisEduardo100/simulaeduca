"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
  const [descriptorCode, setDescriptorCode] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [gradeLevelSlug, setGradeLevelSlug] = useState("");
  const [evaluationSlug, setEvaluationSlug] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleIngest() {
    setIngestResult(null);
    setIngestError(null);

    if (!file && !textContent.trim()) {
      setIngestError("Selecione um arquivo ou cole um texto.");
      return;
    }

    setIsIngesting(true);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      if (textContent.trim()) formData.append("text", textContent);
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
        setIngestError(data.error ?? "Erro desconhecido.");
      } else {
        setIngestResult(`✓ ${data.chunksCreated} chunks criados com sucesso!`);
        // Limpar form
        setFile(null);
        setTextContent("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      setIngestError("Erro de conexão. Tente novamente.");
    } finally {
      setIsIngesting(false);
    }
  }

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
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Metadados do Material</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="evaluation">Avaliação</Label>
                <Select onValueChange={setEvaluationSlug}>
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
                <Select onValueChange={setSubjectSlug}>
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
                <Select onValueChange={setGradeLevelSlug}>
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
                <Select onValueChange={setDifficulty}>
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
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Conteúdo</h2>

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
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
                placeholder="Cole aqui questões, matrizes de referência ou qualquer conteúdo educacional..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
              />
            </div>
          </Card>

          {ingestResult && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-green-800 text-sm">
              {ingestResult}
            </div>
          )}
          {ingestError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
              {ingestError}
            </div>
          )}

          <Button
            onClick={handleIngest}
            disabled={isIngesting}
            className="w-full"
          >
            {isIngesting ? "Processando..." : "Ingerir Material"}
          </Button>
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
