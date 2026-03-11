# SimulaEduca — Guia para Claude Code

## Stack

- **Framework**: Next.js 15 (App Router) com TypeScript
- **UI**: React 19 + shadcn/ui + Tailwind CSS + lucide-react icons
- **Banco**: PostgreSQL + pgvector (embeddings 1536 dims) via Prisma ORM
- **Auth**: NextAuth v5 (beta) — Google OAuth + Email/Password, roles: teacher/admin/coordinator
- **IA**: OpenAI (gpt-4.1-mini para geração, gpt-4o para extração, text-embedding-3-small para embeddings)
- **PDF**: @react-pdf/renderer (server-side)
- **Billing**: Stripe (créditos por questão)

## Estrutura de Diretórios

```
src/
├── app/
│   ├── (dashboard)/           # Layout autenticado com sidebar
│   │   ├── admin/             # Páginas admin (role=admin)
│   │   │   ├── scraping/      # Scraping de arquivos e HTML
│   │   │   ├── knowledge-base/ # Upload e ingestão RAG
│   │   │   ├── cobertura/     # Cobertura de descritores
│   │   │   ├── agentes/       # Monitoramento de agentes IA
│   │   │   └── saude/         # Health check do sistema
│   │   ├── simulados/         # Criação/gerenciamento de simulados
│   │   └── dashboard/         # Dashboard do professor
│   └── api/
│       ├── admin/             # APIs admin-only
│       │   ├── scrape-files/  # Scan, ingest, batch, extract-questions
│       │   ├── ingest/        # Upload direto + questões estruturadas
│       │   ├── descriptor-coverage/
│       │   └── stats/, health/, logs/
│       └── simulados/         # CRUD + gerar + PDF
├── lib/
│   ├── ai/
│   │   ├── agents/            # question-generator, question-extractor, question-validator
│   │   └── rag/               # ingest, retriever, embeddings, extractors, prompts
│   ├── billing/credits.ts
│   ├── db/prisma.ts
│   ├── pdf/generator.ts
│   └── utils/auth.ts
├── components/
│   ├── admin/                 # QuestionCard, GlobalMetadata (shared)
│   ├── layout/                # Sidebar, MobileNav
│   ├── simulado/              # HeaderSelector, DescriptorSelector
│   └── ui/                    # shadcn/ui primitivos
└── types/index.ts             # Tipos compartilhados (Difficulty, CorrectAnswer, etc.)
```

## Modelos Principais (Prisma)

- **Exam** — simulados/atividades/provas com `assessmentType`, `status`, `descriptorDistribution`
- **ExamQuestion** — questões de um exam, com `source` (generated/reused) e `questionBankId`
- **QuestionBank** — banco de questões para reuso, com `origin` (generated/extracted), `validated`, `timesUsed`, embedding
- **QuestionUsage** — tracking de qual questão foi usada em qual exam por qual professor
- **MaterialChunk** — chunks RAG com embedding pgvector, metadata por descritor
- **ScrapedSource** — rastreio de arquivos processados, com `extractionMode` (raw/smart), `status`, `batchId`, `extractedData`
- **Descriptor** — descritores SPAECE/SAEB com unique constraint `[code, evaluationId, subjectId, gradeLevelId]`

## Padrões a Seguir

### APIs Admin
- Verificar `session.user.role === 'admin'` em toda rota `/api/admin/*`
- Usar `z.object()` (zod) para validação de input
- Importar auth de `@/lib/utils/auth`, prisma de `@/lib/db/prisma`

### Componentes
- Componentes compartilhados admin em `src/components/admin/`
- Usar `"use client"` no topo de componentes interativos
- shadcn/ui: Button, Card, Input, Label, Select, Badge, Separator, Tabs

### Ingestão
- `ingestMaterial()` — chunks de texto bruto → material_chunks (RAG context)
- `ingestQuestions()` — questões estruturadas → material_chunks (uma por chunk)
- `ingestExtractedToQuestionBank()` — questões extraídas → question_bank (para reuso)
- `saveToQuestionBank()` — questões geradas → question_bank (com embedding)

### Geração de Questões
- Tenta reuso primeiro via `findReusableQuestion()` (controlado por `reuseRatio`)
- Questões reusadas: 0 créditos, `source='reused'`
- Questões geradas: 1 crédito, `source='generated'`, salvas no question_bank

### Scraping Batch
- `POST /api/admin/scrape-files/batch` → cria registros no banco
- `POST /api/admin/scrape-files/extract-questions` com `sourceId` → persiste resultado
- Frontend salva `batchId` em localStorage para resumo
- Dedup por `fileUrl + extractionMode` (unique constraint)

## Modelos de IA

| Uso | Modelo | Onde |
|-----|--------|------|
| Geração de questões | gpt-4.1-mini | `question-generator.ts` |
| Extração de questões | gpt-4o | `question-extractor.ts` |
| Validação semântica | gpt-4o-mini | `question-validator.ts` |
| Embeddings | text-embedding-3-small (1536d) | `embeddings.ts` |

## Convenções

- Arquivos em inglês, conteúdo/UI em português
- Prisma: `@@map("snake_case")` para tabelas, `@map("snake_case")` para colunas
- Raw SQL com `prisma.$executeRaw` / `prisma.$queryRawUnsafe` para pgvector
- Embeddings como `vector(1536)` com cast `::vector` em SQL
- Dificuldade: `"facil" | "medio" | "dificil"` (sem acento no valor, com acento no display)
- Descritores: código uppercase "D07", "D17", etc.
