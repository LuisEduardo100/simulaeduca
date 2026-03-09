# SimulaEduca - Documentacao Completa do Backend

> Documento gerado em 2026-03-08 | Atualizado em 2026-03-08 | Next.js 15 (App Router) + Prisma + PostgreSQL + pgvector + OpenAI

---

## Indice

1. [Visao Geral da Arquitetura](#1-visao-geral-da-arquitetura)
2. [Infraestrutura (Docker)](#2-infraestrutura-docker)
3. [Banco de Dados - Schema Prisma](#3-banco-de-dados---schema-prisma)
4. [Sistema de Autenticacao](#4-sistema-de-autenticacao)
5. [Rotas da API](#5-rotas-da-api)
6. [Pipeline de Geracao de Simulados](#6-pipeline-de-geracao-de-simulados)
7. [Sistema RAG e Banco Vetorizado](#7-sistema-rag-e-banco-vetorizado)
8. [Web Scraping de Provas](#8-web-scraping-de-provas)
9. [Agentes de IA](#9-agentes-de-ia)
10. [Geracao de PDF](#10-geracao-de-pdf)
11. [Sistema de Creditos e Billing](#11-sistema-de-creditos-e-billing)
12. [Seed e Dados Iniciais](#12-seed-e-dados-iniciais)

---

## 1. Visao Geral da Arquitetura

```
+--------------------+     +---------------------+     +---------------------+
|   Frontend         |     |   API Routes        |     |   Servicos          |
|   (Next.js Pages)  |---->|   (App Router)      |---->|   (lib/)            |
+--------------------+     +---------------------+     +---------------------+
                                    |                          |
                           +--------+--------+        +--------+--------+
                           |                 |        |                 |
                    +------v------+  +-------v-----+  |  +-------------v---+
                    | PostgreSQL  |  |   Redis     |  |  |  OpenAI API     |
                    | + pgvector  |  |   (cache)   |  |  |  (GPT-4o-mini + |
                    +-------------+  +-------------+  |  |   embeddings)   |
                                                      |  +-----------------+
                                               +------v------+
                                               |  Stripe API  |
                                               |  (billing)   |
                                               +--------------+
```

**Stack Principal:**
- **Framework:** Next.js 15 com App Router
- **ORM:** Prisma com `@prisma/adapter-pg`
- **Banco:** PostgreSQL 16 + extensao pgvector (embeddings 1536 dims)
- **Cache:** Redis 7 (Alpine)
- **IA:** OpenAI GPT-4o-mini (geracao) + text-embedding-3-small (embeddings)
- **Auth:** NextAuth.js (JWT + Google OAuth + Credentials)
- **PDF:** @react-pdf/renderer (server-side)
- **Pagamento:** Stripe (em implementacao)

---

## 2. Infraestrutura (Docker)

**Arquivo:** `docker-compose.yml`

| Servico | Imagem | Porta | Finalidade |
|---------|--------|-------|------------|
| PostgreSQL | `pgvector/pgvector:pg16` | 5433:5432 | Banco principal + vetores |
| Redis | `redis:7-alpine` | 6379:6379 | Cache e sessoes |

**Extensoes SQL inicializadas** (`docker/init.sql`):
- `uuid-ossp` - geracao de UUIDs
- `vector` - busca por similaridade vetorial (pgvector)

**Volumes persistentes:** `postgres_data`, `redis_data`

---

## 3. Banco de Dados - Schema Prisma

**Arquivo:** `prisma/schema.prisma`
**Provider:** PostgreSQL
**Total de modelos:** 13

### 3.1 Modelos de Autenticacao

#### User (`users`)
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID (PK) | `gen_random_uuid()` |
| email | String (unique) | Credencial de login |
| name | String? | Nome de exibicao |
| role | String | `"teacher"` / `"admin"` / `"coordinator"` |
| passwordHash | String? | Hash bcrypt (null p/ OAuth) |
| planType | String | `"free"` / `"basic"` / `"pro"` / `"school"` / `"secretaria"` |
| creditsBalance | Int | Saldo de creditos (default: 10) |
| stripeCustomerId | String? | ID do cliente no Stripe |
| school, city, state | String? | Dados do perfil |

**Relacoes:** `accounts[]`, `sessions[]`, `exams[]`, `creditTransactions[]`, `materialChunks[]`, `scrapedSources[]`

#### Account (`accounts`)
Tabela OAuth do NextAuth. Armazena tokens de provedores (Google, etc).
- Unique constraint: `[provider, providerAccountId]`
- Cascade delete com User

#### Session (`sessions`) e VerificationToken (`verification_tokens`)
Tabelas padrao do NextAuth para sessoes e verificacao de email.

---

### 3.2 Modelos Educacionais

#### Subject (`subjects`)
Disciplinas: Matematica, Lingua Portuguesa
Campos: `id`, `name`, `slug` (unique)

#### GradeLevel (`grade_levels`)
Series: 5o ano, 9o ano
Campos: `id`, `name`, `slug` (unique), `level` (fundamental/medio)

#### Evaluation (`evaluations`)
Avaliacoes: SPAECE, SAEB
Campos: `id`, `name`, `slug` (unique)

#### Theme (`themes`)
Temas agrupadores de descritores
Campos: `id`, `name`, `romanNumeral` (I, II, III, IV)
FKs: `evaluationId`, `subjectId`, `gradeLevelId`

#### Descriptor (`descriptors`)
Descritores educacionais (ex: D07, D17, D48...)
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | Int (PK) | Auto-increment |
| code | String | Codigo do descritor (D07) |
| description | String | Descricao completa |
| themeId | Int (FK) | Tema pai |
| evaluationId | Int (FK) | Avaliacao |
| subjectId | Int (FK) | Disciplina |
| gradeLevelId | Int (FK) | Serie |

**Unique constraint:** `[code, evaluationId, subjectId, gradeLevelId]`

---

### 3.3 Modelos de Simulado (Exam)

#### Exam (`exams`)
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID (PK) | ID do simulado |
| userId | UUID (FK) | Professor criador |
| title | String | Titulo da prova |
| status | String | `draft` / `generating` / `completed` / `failed` / `partial` |
| totalQuestions | Int | Questoes ja geradas |
| expectedQuestions | Int | Total de questoes esperado |
| creditsConsumed | Int | Creditos consumidos |
| headerConfig | JSON? | Config do cabecalho (mode, imageBase64, campos) |
| difficulty | String? | `facil` / `medio` / `dificil` / `misto` |
| descriptorDistribution | JSON? | Distribuicao para retomada |
| pdfUrl, answerKeyUrl | String? | URLs dos PDFs gerados |

**Relacoes:** `user`, `evaluation`, `subject`, `gradeLevel`, `questions[]`, `creditTransactions[]`

#### ExamQuestion (`exam_questions`)
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID (PK) | ID da questao |
| examId | UUID (FK) | Simulado pai (cascade delete) |
| questionNumber | Int | Numero da questao |
| descriptorId | Int (FK) | Descritor avaliado |
| stem | String | Enunciado |
| optionA/B/C/D | String | Alternativas |
| correctAnswer | Char(1) | Gabarito (A/B/C/D) |
| justification | String? | Justificativa |
| difficulty | String | `facil` / `medio` / `dificil` |
| generationModel | String? | Modelo usado (gpt-4o-mini) |

---

### 3.4 Modelos RAG (Base de Conhecimento)

#### MaterialChunk (`material_chunks`)
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID (PK) | ID do chunk |
| content | String | Texto do chunk (~1000 chars) |
| sourceType | String | `pdf` / `docx` / `txt` / `text` |
| sourceFileName | String? | Nome do arquivo original |
| descriptorCode | String? | Metadata: descritor (D07) |
| subjectSlug | String? | Metadata: disciplina |
| gradeLevelSlug | String? | Metadata: serie |
| evaluationSlug | String? | Metadata: avaliacao |
| difficulty | String? | Metadata: dificuldade |
| chunkIndex / totalChunks | Int | Posicao no documento |
| uploadedBy | UUID (FK) | Admin que fez upload |
| **embedding** | **Vector(1536)** | **Embedding OpenAI** |

#### ScrapedSource (`scraped_sources`)

Tabela de auditoria de cada arquivo baixado via scraping batch. Criada em 2026-03-08.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID (PK) | `gen_random_uuid()` |
| pageUrl | String | URL da pagina HTML onde o arquivo foi encontrado |
| fileName | String | Nome original do arquivo (ex: `simulado_mat_9ano.pdf`) |
| fileUrl | String | URL direta de download do arquivo |
| fileType | String | `pdf` / `docx` / `txt` |
| fileSize | Int? | Tamanho em bytes |
| storedPath | String? | Caminho relativo do arquivo salvo em `storage/provas-scraped/` |
| chunksCreated | Int | Quantidade de chunks criados no material_chunks |
| descriptorCode | String? | Descritor associado na ingestao (ex: `D07`) |
| subjectSlug | String? | Disciplina associada (ex: `matematica`) |
| gradeLevelSlug | String? | Serie associada (ex: `9_ano`) |
| evaluationSlug | String? | Avaliacao associada (ex: `spaece`) |
| difficulty | String? | Dificuldade dos chunks |
| scrapedBy | UUID (FK) | Admin que executou o scraping |
| createdAt | DateTime | Timestamp do scraping |

**Relacoes:** `scraper User`

---

#### QuestionBank (`question_bank`)
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID (PK) | ID |
| descriptorId | Int (FK) | Descritor |
| stem, options, correctAnswer | String | Questao completa |
| qualityScore | Decimal(3,2) | Score de qualidade (0-1) |
| timesUsed | Int | Contador de uso |
| flagged | Boolean | Marcada para revisao |
| **embedding** | **Vector(1536)** | **Embedding para busca semantica** |

---

### 3.5 Modelos de Creditos e Planos

#### CreditTransaction (`credit_transactions`)
| Campo | Tipo | Descricao |
|-------|------|-----------|
| amount | Int | Positivo = adicao, negativo = consumo |
| type | String | `usage` / `purchase` / `subscription` / `bonus` |
| examId | UUID? (FK) | Simulado relacionado |
| stripePaymentId | String? | Referencia Stripe |

#### Plan (`plans`)
| Plano | Preco/mes | Creditos/mes | Max questoes |
|-------|-----------|-------------|-------------|
| Gratuito | R$ 0 | 10 | 5 |
| Basico | R$ 29,90 | 100 | 15 |
| Pro | R$ 69,90 | 500 | 30 |
| Escola | R$ 199,90 | 2000 | 50 |

**Features por plano:** watermark, pdf, questionBank, commentedAnswerKey, multiTeacher, reports

---

## 4. Sistema de Autenticacao

**Arquivos:** `src/lib/utils/auth.ts`, `src/lib/utils/auth.config.ts`, `src/middleware.ts`

### Provedores
1. **Google OAuth** - Login social via `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
2. **Credentials** - Email + senha com bcrypt (salt rounds: 12)

### Estrategia de Sessao
- **JWT** (obrigatorio com Credentials + PrismaAdapter)
- Token enriquecido com `user.id` e `user.role`
- Session expoe: `{ id, name, email, image, role }`

### Middleware de Protecao

```
Rotas protegidas:
  /dashboard/*     -> Requer login
  /simulados/*     -> Requer login
  /creditos/*      -> Requer login
  /configuracoes/* -> Requer login
  /admin/*         -> Requer login + role === "admin"

Nao autenticado -> Redirect /login
Nao admin em /admin -> Redirect /dashboard
```

### Roles
| Role | Permissoes |
|------|-----------|
| `teacher` | Criar simulados, ver creditos, editar perfil |
| `admin` | Tudo acima + scraping, ingestao, knowledge base |
| `coordinator` | Definido no schema, uso futuro |

---

## 5. Rotas da API

### 5.1 Autenticacao

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET/POST | `/api/auth/[...nextauth]` | Handlers NextAuth | - |
| POST | `/api/auth/register` | Registro com email/senha | Nao |
| POST | `/api/auth/reset-password` | Reset de senha (MVP) | Nao |

### 5.2 Perfil do Usuario

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET | `/api/user/profile` | Buscar perfil | Sim |
| PATCH | `/api/user/profile` | Atualizar nome/escola/cidade/estado | Sim |

### 5.3 Simulados

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET | `/api/simulados` | Listar simulados (paginado) | Sim |
| POST | `/api/simulados` | Criar rascunho de simulado | Sim |
| POST | `/api/simulados/gerar` | Gerar questoes com IA | Sim |
| GET | `/api/simulados/[id]/progresso` | Progresso da geracao em tempo real | Sim |
| GET | `/api/simulados/pdf` | Baixar PDF (prova ou gabarito) | Sim |

### 5.4 Descritores

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET | `/api/descritores` | Buscar descritores por avaliacao/disciplina/serie | Nao |

### 5.5 Creditos

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET | `/api/creditos` | Saldo + ultimas 20 transacoes | Sim |

### 5.6 Admin

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| POST | `/api/admin/scrape` | Extrair texto de pagina HTML | Admin |
| GET | `/api/admin/ingest` | Listar materiais indexados | Admin |
| POST | `/api/admin/ingest` | Ingerir material (arquivo ou texto) | Admin |
| DELETE | `/api/admin/ingest` | Remover material por nome | Admin |
| **POST** | **`/api/admin/scrape-files`** | **Escanear pagina HTML e listar arquivos encontrados (PDF/DOCX/TXT)** | Admin |
| **GET** | **`/api/admin/scrape-files`** | **Listar historico de fontes ja raspadas** | Admin |
| **DELETE** | **`/api/admin/scrape-files?id=...`** | **Remover registro + chunks RAG da fonte** | Admin |
| **POST** | **`/api/admin/scrape-files/ingest`** | **Baixar, extrair e ingerir arquivos selecionados no pgvector** | Admin |

### 5.7 Webhooks

| Metodo | Rota | Descricao | Status |
|--------|------|-----------|--------|
| POST | `/api/webhooks/stripe` | Webhook do Stripe | TODO (stub) |

---

## 6. Pipeline de Geracao de Simulados

### Fluxo Completo (end-to-end)

```
FRONTEND                              BACKEND                              IA / RAG
--------                              -------                              --------
1. Preenche formulario
   (avaliacao, disciplina, serie)
   |
   +--POST /api/simulados-----------> Cria Exam (status: "draft")
   |                                   Retorna examId
   |
2. Seleciona descritores
   + quantidade por descritor
   |
   +--POST /api/simulados/gerar------> Valida ownership + creditos
                                        |
                                        +--Expande distribuicao:
                                        |  {D07: 3, D17: 2} -> [D07,D07,D07,D17,D17]
                                        |
                                        +--Pre-fetch descritores (batch)
                                        |
                                        +--PARA CADA questao (lotes de 5):
                                        |   |
                                        |   +--RAG: query = "D07 Resolver problemas..."
                                        |   |        retrieveRelevantChunks()
                                        |   |        Top 5 chunks por similaridade ------> pgvector
                                        |   |                                              cosine <=>
                                        |   +--Prompt: buildQuestionGenerationPrompt()
                                        |   |        (descritor + serie + chunks RAG)
                                        |   |
                                        |   +--LLM: GPT-4o-mini (temp 0.7) -----------> OpenAI API
                                        |   |        Parse JSON + retry (max 3x)
                                        |   |
                                        |   +--Shuffle: Fisher-Yates nas opcoes
                                        |   |        (evita vies do LLM na posicao A)
                                        |   |
                                        |   +--Validacao:
                                        |   |   1. Estrutural (local): stem>20, opts>5
                                        |   |   2. Semantica (LLM temp 0): ---------> OpenAI API
                                        |   |      resposta correta? distratores?
                                        |   |
                                        |   +--Salva ExamQuestion no banco
                                        |   +--Deduz 1 credito (transacao atomica)
                                        |   +--Atualiza progresso do exam
                                        |   +--Salva no QuestionBank (async, fire&forget)
                                        |
                                        +--Marca status: "completed" / "partial" / "failed"
   |
3. Polling a cada 1.5s
   GET /api/simulados/[id]/progresso
   (mostra barra de progresso)
   |
4. Visualiza / Baixa PDF
   GET /api/simulados/pdf?examId=X&type=exam
```

### Status do Simulado
```
draft -> generating -> completed
                    -> partial (pode retomar com resume: true)
                    -> failed
```

### Retomada (Resume)
Se a geracao falha no meio, o exam fica com status `partial`. O usuario pode clicar "Retomar" que chama o mesmo endpoint com `resume: true`. O backend calcula quantas questoes faltam e continua de onde parou.

---

## 7. Sistema RAG e Banco Vetorizado

### Arquitetura do RAG

```
INGESTAO                                    RECUPERACAO
--------                                    -----------
Material (PDF/DOCX/TXT/URL)                 Query do descritor
    |                                            |
    v                                            v
Extracao de texto                           Gera embedding da query
(pdf-parse / mammoth)                       (text-embedding-3-small)
    |                                            |
    v                                            v
Chunking                                    Busca por similaridade
(RecursiveCharacterTextSplitter)            (pgvector cosine <=>)
1000 chars, 100 overlap                          |
    |                                            v
    v                                       Filtragem:
Gera embeddings (batch)                     - descriptor_code = X (prioridade)
(text-embedding-3-small, 1536 dims)         - OR subject_slug + grade_level_slug
    |                                            |
    v                                            v
Insere no PostgreSQL                        Top 5 chunks mais similares
(material_chunks + pgvector)                -> Prompt do question-generator
```

### Detalhes Tecnicos

| Componente | Tecnologia | Configuracao |
|-----------|-----------|-------------|
| Vector DB | PostgreSQL + pgvector | Extensao `vector` |
| Embedding | OpenAI `text-embedding-3-small` | 1536 dimensoes |
| Chunking | LangChain `RecursiveCharacterTextSplitter` | 1000 chars, 100 overlap |
| Similaridade | Cosine distance (`<=>`) | Top-K = 5 |
| Separadores | `\n\n`, `\n`, `. `, `! `, `? `, ` ` | Nessa ordem de prioridade |

### Arquivos do RAG

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/lib/ai/rag/embeddings.ts` | Geracao de embeddings (single e batch) |
| `src/lib/ai/rag/ingest.ts` | Chunking + embedding + insercao no banco |
| `src/lib/ai/rag/retriever.ts` | Busca semantica com filtros de metadata |
| `src/lib/ai/rag/extractors.ts` | Extracao de texto de PDF/DOCX/TXT |
| `src/lib/ai/rag/prompts.ts` | Templates de prompt (geracao + validacao) |

### Query SQL de Recuperacao

```sql
SELECT content, source_type, descriptor_code,
       1 - (embedding <=> $queryVector::vector) AS similarity
FROM material_chunks
WHERE embedding IS NOT NULL
  AND (
    descriptor_code = $descriptorCode
    OR (subject_slug = $subjectSlug AND grade_level_slug = $gradeLevelSlug)
  )
ORDER BY embedding <=> $queryVector::vector
LIMIT $topK
```

---

## 8. Web Scraping de Provas

A UI de scraping (`/admin/scraping`) possui **duas abas** independentes implementadas em `src/app/(dashboard)/admin/scraping/page.tsx`.

---

### 8.1 Aba 1: Scraping de Texto HTML (Pipeline Original)

Extrai texto puro de qualquer pagina HTML e ingere diretamente no RAG.

**Arquivos:** `src/app/api/admin/scrape/route.ts` + `src/app/api/admin/ingest/route.ts`

```
Admin UI
    |
    v
1. Digita URL da pagina
    |
    +--POST /api/admin/scrape
    |
    v
2. Validacao de seguranca:
   - URL valida (Zod)
   - Host nao bloqueado (localhost, 127.0.0.1, .local)
    |
    v
3. Fetch da pagina (timeout: 15s, aceita text/html e text/plain)
    |
    v
4. Extracao de texto:
   - Remove: <script>, <style>, <noscript>, <nav>, <footer>, <header>
   - Preserva: <p>, <div>, <li>, <h1-6>, <tr>, <td>
   - Decodifica entidades HTML (acentos pt-BR)
   - Normaliza whitespace | Limite: 50.000 caracteres
    |
    v
5. Retorna: { text, title, wordCount, url }
    |
    v
6. Admin revisa/edita o texto extraido
    |
    v
7. Configura metadata (avaliacao, disciplina, serie, dificuldade, descritor)
    |
    +--POST /api/admin/ingest (com texto extraido)
    |
    v
8. Pipeline RAG: Chunking -> Embedding -> pgvector
```

---

### 8.2 Aba 2: Scraping de Arquivos Batch - PDF/DOCX/TXT (Implementado em 2026-03-08)

Pipeline de 2 fases para baixar e ingerir arquivos linkados em uma pagina HTML. Soluciona o caso em que a pagina contem apenas links de download (`.pdf`, `.docx`) sem texto extraivel.

**Arquivos:**
- `src/app/api/admin/scrape-files/route.ts` — Fase 1: scan + historico + delete
- `src/app/api/admin/scrape-files/ingest/route.ts` — Fase 2: download + extracao + ingestao

#### Fase 1: Escanear Pagina (`POST /api/admin/scrape-files`)

```
Admin digita URL da pagina
    |
    +--POST /api/admin/scrape-files
    |
    v
1. Validacao:
   - URL valida (Zod)
   - Host nao bloqueado (localhost, 127.0.0.1, 0.0.0.0, ::1, .local)
    |
    v
2. Fetch da pagina (timeout: 15s)
   - Aceita apenas text/html e text/plain
    |
    v
3. extractFileLinks(html, baseUrl):
   - Regex: <a href="..."> tags
   - Filtra: PDF, DOCX/DOC, TXT por extensao do pathname
   - Resolve URLs relativas -> absolutas
   - Deduplica com Set<string>
   - Extrai nome do arquivo via decodeURIComponent
    |
    v
4. Retorna: { files: FoundFile[], total, pageUrl }
   onde FoundFile = { url, filename, type }
```

#### Fase 2: Ingerir Arquivos Selecionados (`POST /api/admin/scrape-files/ingest`)

```
Admin seleciona arquivos + configura metadata
    |
    +--POST /api/admin/scrape-files/ingest
    |  Body: { pageUrl, files: FoundFile[], metadata: { descriptorCode?, subjectSlug?,
    |           gradeLevelSlug?, evaluationSlug?, difficulty? } }
    |
    v
Zod: max 20 arquivos, todos os campos validados
    |
    v
PARA CADA arquivo selecionado:
    |
    +--1. Download do arquivo (fetch, timeout: 30s)
    |     Headers: User-Agent, Accept-Language
    |
    +--2. Salvar em storage/provas-scraped/{timestamp}_{safeName}
    |     (rastreio local, nao bloqueia em caso de falha de disco)
    |
    +--3. Extrair texto:
    |     PDF  -> extractFromPdf(buffer)    [pdf-parse]
    |     DOCX -> extractFromDocx(buffer)   [mammoth]
    |     TXT  -> extractFromTxt(buffer)    [utf-8 decode]
    |
    +--4. ingestMaterial():
    |     - Chunking (1000 chars, 100 overlap)
    |     - Embeddings batch (text-embedding-3-small)
    |     - INSERT no material_chunks (N inserts sequenciais)
    |
    +--5. prisma.scrapedSource.create():
    |     Registra auditoria completa na tabela scraped_sources
    |
    +--Acumula IngestFileResult: { url, filename, status, chunksCreated?, error? }

    v
Retorna: { results: IngestFileResult[], summary: { success, failed, totalChunks } }
```

#### Gerenciar Historico

| Operacao | Endpoint | Detalhe |
|----------|----------|---------|
| Listar fontes | `GET /api/admin/scrape-files` | Ordena por `createdAt DESC` |
| Remover fonte | `DELETE /api/admin/scrape-files?id=X` | Remove registro + chunks do RAG via `deleteMaterialBySource(fileName)` |

#### Validacao de Seguranca
- Bloqueio de IPs internos em ambos os endpoints
- Timeout 15s (scan) e 30s (download)
- Zod: maxFiles = 20 por chamada
- Content-Type verificado na fase de scan
- Apenas admin autenticado (`role === "admin"`)

#### Limitacoes Conhecidas
- Sem rate limiting nos endpoints
- Sem verificacao de MIME type real (magic bytes) nos arquivos baixados
- Sem limit de tamanho de arquivo na fase de download
- Parsing de links via regex (nao usa DOM parser)
- INSERT sequencial na ingestao (N round-trips, ver ARCHITECTURE_REVIEW.md)

---

### 8.3 Bibliotecas de Extracao (`src/lib/ai/rag/extractors.ts`)

| Funcao | Biblioteca | Formato |
|--------|-----------|---------|
| `extractFromPdf(buffer)` | `pdf-parse` | PDF binario |
| `extractFromDocx(buffer)` | `mammoth` | DOCX binario |
| `extractFromTxt(buffer)` | Node.js nativo | Buffer UTF-8 |

### 8.4 Armazenamento Local de Arquivos

**Diretorio:** `storage/provas-scraped/`
**Formato do nome:** `{timestamp_ms}_{safeName}` (caracteres especiais substituidos por `_`)
**Finalidade:** Rastreio, reprocessamento futuro, auditoria legal (LGPD)
**Campo:** `ScrapedSource.storedPath` armazena o caminho relativo ao `process.cwd()`

---

## 9. Agentes de IA

### Arquitetura de 3 Agentes

| Agente | Arquivo | LLM | Temperatura | Status |
|--------|---------|-----|-------------|--------|
| Question Generator | `src/lib/ai/agents/question-generator.ts` | GPT-4o-mini | 0.7 | Implementado |
| Question Validator | `src/lib/ai/agents/question-validator.ts` | GPT-4o-mini | 0.0 | Implementado |
| Exam Formatter | `src/lib/ai/agents/exam-formatter.ts` | - | - | TODO |

### Question Generator

**Input:**
```typescript
{
  descriptorCode: "D07",
  descriptorDescription: "Resolver problema envolvendo...",
  gradeLevelSlug: "9_ano",
  subjectSlug: "matematica",
  evaluationSlug: "spaece",
  gradeLevel: "9o ano",
  subject: "Matematica"
}
```

**Processo:**
1. Busca chunks RAG relevantes (top 5 por similaridade)
2. Constroi prompt com contexto do descritor + exemplos RAG
3. Chama GPT-4o-mini (temp 0.7)
4. Parse JSON da resposta (retry ate 3x)
5. Shuffle Fisher-Yates das opcoes (evita vies posicional)

**Output:**
```typescript
{
  stem: "Em uma loja...",
  optionA: "(A) 25%",
  optionB: "(B) 30%",
  optionC: "(C) 20%",
  optionD: "(D) 35%",
  correctAnswer: "A",
  justification: "A resposta correta e A porque...",
  difficulty: "medio",
  descriptorCode: "D07"
}
```

### Question Validator

**Camada 1 - Estrutural (sem LLM):**
- Enunciado minimo 20 caracteres
- Cada opcao minimo 5 caracteres
- correctAnswer em {A, B, C, D}

**Camada 2 - Semantica (com LLM, temp 0):**
- A resposta marcada esta realmente correta?
- As outras opcoes sao realmente incorretas?
- A questao avalia o descritor correto?
- Os distratores sao plausiveis (erros comuns)?

**Fallback:** Se a validacao LLM falhar, aceita a questao (estrutural passou).

### Prompts Principais (`src/lib/ai/rag/prompts.ts`)

**Prompt de Geracao:**
- Role: Especialista em avaliacao educacional SPAECE/SAEB
- Contexto: Descritor + serie + disciplina + chunks RAG
- Instrucoes: 1 questao, 4 opcoes, distratores plausiveis, linguagem adequada a serie
- Formato: JSON estrito

**Prompt de Validacao:**
- Role: Especialista em avaliacao educacional
- Tarefa: Verificar corretude, alinhamento ao descritor, plausibilidade dos distratores
- Formato: JSON `{ isValid, errors[] }`

---

## 10. Geracao de PDF

**Arquivo:** `src/lib/pdf/generator.ts`
**Biblioteca:** `@react-pdf/renderer` (server-side com `renderToBuffer`)

### Tipos de PDF

| Tipo | Descricao | Rota |
|------|-----------|------|
| Prova | Simulado completo com questoes | `GET /api/simulados/pdf?type=exam` |
| Gabarito | Grade de respostas + justificativas | `GET /api/simulados/pdf?type=answer_key` |

### Modos de Cabecalho

| Modo | Descricao |
|------|-----------|
| `standard` | Layout padrao com escola, professor, data, campos do aluno |
| `custom` | Logo customizado (base64) + campos editaveis |
| `none` | Cabecalho minimo |

### Layout
- **1 coluna** (padrao): Questoes em largura total, fonte 10pt
- **2 colunas**: Layout compacto, fonte 8pt, economiza papel
- Fonte: Helvetica, line-height 1.3-1.4
- Codigo do descritor em cinza (7-8pt) por questao

---

## 11. Sistema de Creditos e Billing

### Custos

| Acao | Custo |
|------|-------|
| Gerar 1 questao | 1 credito |
| Regenerar questao | 1 credito |
| Gerar PDF | Gratis |

### Operacoes de Credito (`src/lib/billing/credits.ts`)

| Funcao | Descricao |
|--------|-----------|
| `getUserCredits(userId)` | Retorna saldo atual |
| `hasEnoughCredits(userId, amount)` | Verifica saldo suficiente |
| `deductCredits(userId, amount, examId, desc)` | Debita atomicamente (transacao Prisma) |
| `addCredits(userId, amount, type, desc)` | Credita (compra/assinatura/bonus) |

### Transacao Atomica (deducao)
1. Decrementa `user.creditsBalance`
2. Cria `CreditTransaction` (type: "usage", amount: -N)
3. Ambos na mesma transacao Prisma (consistencia garantida)

### Planos

| Plano | Preco | Creditos | Max questoes | Features |
|-------|-------|----------|-------------|----------|
| Gratuito | R$ 0 | 10/mes | 5 | Watermark, PDF basico |
| Basico | R$ 29,90 | 100/mes | 15 | Sem watermark |
| Pro | R$ 69,90 | 500/mes | 30 | + Banco de questoes, gabarito comentado |
| Escola | R$ 199,90 | 2000/mes | 50 | + Multi-professor, relatorios |

### Stripe (em implementacao)
- Webhook em `/api/webhooks/stripe` (atualmente stub)
- Eventos planejados: `checkout.session.completed`, `invoice.payment_succeeded`

---

## 12. Seed e Dados Iniciais

**Arquivo:** `prisma/seed/seed.ts`
**Comando:** `npm run db:seed`

### Dados Semeados

| Entidade | Quantidade | Exemplos |
|----------|-----------|---------|
| Avaliacoes | 2 | SPAECE, SAEB |
| Disciplinas | 2 | Matematica, Lingua Portuguesa |
| Series | 2 | 5o ano, 9o ano |
| Temas | 4 | I-Numeros e Funcoes, II-Geometria, III-Medidas, IV-Informacao |
| Descritores | 25 | D07-D77 (SPAECE Matematica 9o ano) |
| Planos | 4 | Gratuito, Basico, Pro, Escola |

### Scripts Utilitarios (`scripts/`)

| Script | Descricao |
|--------|-----------|
| `create-admin.ts` | Cria usuario admin (admin@email.com / admin123) |
| `show-setup-summary.ts` | Exibe progresso do setup e roadmap |

### Ingestao de Materiais RAG
**Script:** `prisma/seed/rag/ingest-materials.ts`
**Comando:** `npx tsx prisma/seed/rag/ingest-materials.ts`
**Requer:** `SEED_ADMIN_USER_ID` no `.env`
**Processo:** Le materiais de `prisma/seed/rag/materials/`, extrai texto, chunka, gera embeddings, insere no banco.

---

## Mapa de Arquivos do Backend

```
src/
  app/
    api/
      auth/
        [...nextauth]/route.ts    # Handlers NextAuth
        register/route.ts          # POST registro
        reset-password/route.ts    # POST reset senha
      admin/
        scrape/route.ts            # POST scraping web (texto HTML)
        ingest/route.ts            # GET/POST/DELETE ingestao RAG
        scrape-files/
          route.ts                 # POST scan de links | GET historico | DELETE fonte
          ingest/route.ts          # POST download + extracao + ingestao batch
      simulados/
        route.ts                   # GET listar / POST criar
        gerar/route.ts             # POST gerar questoes
        pdf/route.ts               # GET baixar PDF
        [id]/progresso/route.ts    # GET progresso geracao
      descritores/route.ts         # GET buscar descritores
      creditos/route.ts            # GET saldo + transacoes
      user/profile/route.ts        # GET/PATCH perfil
      webhooks/stripe/route.ts     # POST webhook Stripe (TODO)
  lib/
    ai/
      index.ts                     # Orquestrador principal
      agents/
        question-generator.ts      # Geracao de questoes
        question-validator.ts      # Validacao estrutural + semantica
        exam-formatter.ts          # Formatacao (TODO)
      rag/
        embeddings.ts              # OpenAI embeddings
        extractors.ts              # Extracao PDF/DOCX/TXT
        ingest.ts                  # Chunking + armazenamento
        retriever.ts               # Busca semantica pgvector
        prompts.ts                 # Templates de prompt
    billing/
      credits.ts                   # Operacoes de credito
      plans.ts                     # Logica de planos
      stripe.ts                    # Client Stripe
    db/
      prisma.ts                    # Client Prisma (singleton)
    pdf/
      generator.ts                 # Geracao PDF (react-pdf)
    utils/
      auth.ts                      # Config NextAuth completa
      auth.config.ts               # Config Edge (middleware)
      constants.ts                 # Custos, labels, status
  middleware.ts                    # Protecao de rotas
  types/index.ts                   # Tipos TypeScript
prisma/
  schema.prisma                    # Schema do banco
  seed/
    seed.ts                        # Script de seed
    data/                          # JSONs de descritores e planos
    rag/
      ingest-materials.ts          # Ingestao batch de materiais
scripts/
  create-admin.ts                  # Criar admin
  show-setup-summary.ts            # Setup summary
```
