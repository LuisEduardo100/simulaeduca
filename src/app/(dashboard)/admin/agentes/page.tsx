"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bot, Cpu, Search, ShieldCheck, FileText } from "lucide-react";

interface AgentInfo {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  model: string;
  temperature: number;
  status: "active" | "todo";
  tools: { name: string; description: string }[];
  pipeline: string;
}

const agents: AgentInfo[] = [
  {
    name: "Question Generator",
    icon: Bot,
    description:
      "Gera questoes de multipla escolha a partir de descritores educacionais, usando contexto RAG da base de conhecimento.",
    model: "gpt-4.1-mini",
    temperature: 0.7,
    status: "active",
    tools: [
      {
        name: "retrieveRelevantChunks",
        description:
          "Busca ate 5 chunks relevantes via similaridade vetorial (pgvector cosine)",
      },
      {
        name: "buildQuestionGenerationPrompt",
        description:
          "Monta prompt com contexto RAG, descritor e nivel de dificuldade",
      },
      {
        name: "shuffleOptions",
        description:
          "Embaralha alternativas (Fisher-Yates) para evitar bias na letra A",
      },
    ],
    pipeline: "Etapa 1 de 3 - Geracao",
  },
  {
    name: "Question Validator",
    icon: ShieldCheck,
    description:
      "Valida questoes em 2 estagios: validacao estrutural (sem LLM) + validacao semantica (verifica corretude, distractores, alinhamento com descritor).",
    model: "gpt-4o-mini",
    temperature: 0,
    status: "active",
    tools: [
      {
        name: "structuralValidation",
        description:
          "Verifica tamanho do enunciado (>= 20 chars), opcoes (>= 5 chars) e resposta valida",
      },
      {
        name: "semanticValidation",
        description:
          "LLM verifica se resposta correta esta certa, distractores sao plausveis e questao avalia o descritor",
      },
    ],
    pipeline: "Etapa 2 de 3 - Validacao",
  },
  {
    name: "Question Extractor",
    icon: Search,
    description:
      "Extrai questoes estruturadas a partir de texto bruto (HTML, PDF, DOCX) coletado via web scraping ou upload.",
    model: "gpt-4o",
    temperature: 0,
    status: "active",
    tools: [
      {
        name: "extractQuestionsFromText",
        description:
          "Identifica questoes de multipla escolha em texto livre (ate 40k chars)",
      },
      {
        name: "normalizeOptions",
        description:
          "Normaliza formatos de alternativas (1/2/3/4, bullets) para A/B/C/D",
      },
    ],
    pipeline: "Pipeline Scraping - Extracao",
  },
  {
    name: "Exam Formatter",
    icon: FileText,
    description:
      "Formata a prova completa com numeracao, cabecalho (professor/escola) e gera gabarito.",
    model: "-",
    temperature: 0,
    status: "todo",
    tools: [],
    pipeline: "Etapa 3 de 3 - Formatacao",
  },
];

const pipelineSteps = [
  {
    step: 1,
    label: "Geracao",
    description:
      "Question Generator recebe descritor + dificuldade, busca contexto RAG e gera questao via LLM",
    agent: "Question Generator",
  },
  {
    step: 2,
    label: "Validacao",
    description:
      "Question Validator verifica estrutura e semantica. Se falhar, retorna para geracao (ate 4 tentativas)",
    agent: "Question Validator",
  },
  {
    step: 3,
    label: "Persistencia",
    description:
      "Questao aprovada e salva em exam_questions e no banco de questoes (question_bank) com embedding",
    agent: "-",
  },
  {
    step: 4,
    label: "PDF",
    description:
      "Prova completa e formatada em PDF com cabecalho, questoes numeradas e gabarito separado",
    agent: "Exam Formatter (TODO)",
  },
];

export default function AdminAgentesPage() {
  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Painel de Agentes</h1>
        <p className="text-sm text-muted-foreground">
          Agentes de IA registrados no sistema e pipeline de geracao de questoes
        </p>
      </div>

      {/* Pipeline visual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pipeline de Geracao de Questoes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {pipelineSteps.map((step, i) => (
              <div key={step.step} className="relative">
                <div className="border rounded-lg p-4 h-full">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {step.step}
                    </span>
                    <span className="font-medium text-sm">{step.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {step.description}
                  </p>
                  <p className="text-xs mt-2 font-mono text-primary">
                    {step.agent}
                  </p>
                </div>
                {i < pipelineSteps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 text-muted-foreground">
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agent cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {agents.map((agent) => {
          const Icon = agent.icon;
          return (
            <Card key={agent.name}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {agent.pipeline}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      agent.status === "active" ? "default" : "secondary"
                    }
                  >
                    {agent.status === "active" ? "Ativo" : "TODO"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {agent.description}
                </p>

                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{agent.model}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Temp: </span>
                    <span className="font-mono">{agent.temperature}</span>
                  </div>
                </div>

                {agent.tools.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium mb-2">Ferramentas:</p>
                      <div className="space-y-1.5">
                        {agent.tools.map((tool) => (
                          <div key={tool.name} className="text-xs">
                            <span className="font-mono text-primary">
                              {tool.name}
                            </span>
                            <span className="text-muted-foreground ml-1">
                              - {tool.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* RAG Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuracao RAG</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="font-medium mb-1">Embedding</p>
              <p className="text-muted-foreground font-mono text-xs">
                text-embedding-3-small
              </p>
              <p className="text-muted-foreground text-xs">
                1536 dimensoes - OpenAI
              </p>
            </div>
            <div>
              <p className="font-medium mb-1">Chunking</p>
              <p className="text-muted-foreground text-xs">
                Tamanho: 1000 chars | Overlap: 100 chars
              </p>
              <p className="text-muted-foreground text-xs">
                RecursiveCharacterTextSplitter (LangChain)
              </p>
            </div>
            <div>
              <p className="font-medium mb-1">Retrieval</p>
              <p className="text-muted-foreground text-xs">
                Top K: 5 chunks | Similaridade: cosine
              </p>
              <p className="text-muted-foreground text-xs">
                pgvector (PostgreSQL)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
