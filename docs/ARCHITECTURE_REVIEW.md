# Architecture Review & Scalability Plan

> Analise tecnica profunda do backend SimulaEduca
> Gerado em 2026-03-08 | Atualizado em 2026-03-08 | Escopo: Auditoria + Escalabilidade + Otimizacao de Custos

---

## Indice

1. [Auditoria do Backend Atual](#1-auditoria-do-backend-atual)
2. [Estrategia de Dados e Vetorizacao](#2-estrategia-de-dados-e-vetorizacao)
3. [Persistencia e Otimizacao de Custos](#3-persistencia-e-otimizacao-de-custos)
4. [Seguranca, Tradeoffs e Melhorias](#4-seguranca-tradeoffs-e-melhorias)
5. [Roadmap Tecnico de Refatoracao](#5-roadmap-tecnico-de-refatoracao)

---

## 1. Auditoria do Backend Atual

### 1.1 Problemas Criticos Encontrados

#### A. INDEXES AUSENTES NO PGVECTOR (Impacto: CRITICO)

**Arquivo:** `prisma/schema.prisma` (modelos MaterialChunk e QuestionBank)

**Problema:** Nao existe nenhum indice HNSW ou IVFFlat nas colunas `embedding`. Toda busca por similaridade vetorial faz **sequential scan** (varre a tabela inteira).

**Tambem faltam indices nas colunas de filtro:**
- `descriptor_code` (filtrado em toda query RAG)
- `subject_slug` + `grade_level_slug` (filtro combinado)
- `source_file_name` (usado em DELETE)
- `exams.user_id` (filtrado em toda listagem)
- `exams.status` (filtro frequente)

**Correcao necessaria (SQL):**
```sql
-- Indices vetoriais (HNSW para busca aproximada rapida)
CREATE INDEX idx_material_chunks_embedding
  ON material_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_question_bank_embedding
  ON question_bank USING hnsw (embedding vector_cosine_ops);

-- Indices de metadata para filtros
CREATE INDEX idx_material_chunks_descriptor ON material_chunks(descriptor_code);
CREATE INDEX idx_material_chunks_subject_grade ON material_chunks(subject_slug, grade_level_slug);
CREATE INDEX idx_material_chunks_source ON material_chunks(source_file_name);

-- Indices de query do simulado
CREATE INDEX idx_exams_user_id ON exams(user_id);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_user_created ON exams(user_id, created_at DESC);
```

**Impacto sem correcao:** Com 10k+ chunks, queries que hoje levam ~50ms passarao a levar 2-5 segundos. Com 100k+, a aplicacao se torna inutilizavel.

---

#### B. RACE CONDITION na Deducao de Creditos (Impacto: CRITICO)

**Arquivo:** `src/lib/billing/credits.ts`

**Problema:** Padrao check-then-act sem isolamento:
```
1. hasEnoughCredits(userId, 3) → true (saldo: 5)
2. Outra request: hasEnoughCredits(userId, 3) → true (saldo ainda: 5)
3. Ambas procedem → deductCredits(userId, 3) + deductCredits(userId, 3) = saldo: -1
```

O `deductCredits` usa transacao Prisma, mas apenas entre o UPDATE e o CREATE do CreditTransaction. Nao previne leituras concorrentes do saldo.

**Correcao:**
```typescript
export async function deductCreditsAtomic(
  userId: string, amount: number, examId?: string
) {
  return prisma.$transaction(async (tx) => {
    // Lock the row with serializable isolation
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditsBalance: true }
    });
    if (user.creditsBalance < amount) {
      throw new Error("Creditos insuficientes");
    }
    await tx.user.update({
      where: { id: userId },
      data: { creditsBalance: { decrement: amount } }
    });
    await tx.creditTransaction.create({
      data: { userId, amount: -amount, type: "usage", examId }
    });
  }, { isolationLevel: "Serializable" });
}
```

---

#### C. INSERT Sequencial na Ingestao (Impacto: ALTO)

**Arquivo:** `src/lib/ai/rag/ingest.ts`

**Problema:** Cada chunk e inserido individualmente em loop `await`:
```typescript
for (let i = 0; i < chunks.length; i++) {
  await prisma.$executeRaw`INSERT INTO material_chunks ...`;
}
```

100 chunks = 100 round-trips sequenciais ao banco.

**Correcao:** Batch INSERT com VALUES multiplos ou `prisma.materialChunk.createMany()`.

---

#### D. Connection Pool Sem Configuracao (Impacto: ALTO)

**Arquivo:** `src/lib/db/prisma.ts`

**Problema:** `new Pool({ connectionString })` sem limites explicitos.
- Default: max 10 conexoes (insuficiente com geracao paralela)
- Sem idle timeout
- Sem connection timeout

**Correcao:**
```typescript
const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

---

#### E. Redis Configurado mas Nunca Utilizado (Impacto: MEDIO)

**Arquivo:** `docker-compose.yml` → Redis rodando na porta 6379

**Situacao:** Container ativo, mas nenhum codigo da aplicacao se conecta ao Redis. Oportunidades perdidas:
- Cache de descritores (muda raramente, consultado em toda geracao)
- Rate limiting por usuario
- Fila de jobs para geracao assincrona
- Cache de embeddings para queries repetidas

---

#### F. Geracao de PDF Sincrona no Request Handler (Impacto: MEDIO)

**Arquivo:** `src/app/api/simulados/pdf/route.ts`

**Problema:** `await generateExamPdf(pdfData)` bloqueia a thread por 2-5 segundos. Com requests concorrentes, starva outros endpoints.

**Correcao futura:** Mover para background job (Bull/BullMQ com Redis) ou usar streaming.

---

### 1.2 Suporte a Multitenancy

**Estado atual: NAO SUPORTA**

| Aspecto | Atual | Necessario |
|---------|-------|-----------|
| Isolamento de dados | Nenhum - todos veem tudo | Por organizacao (escola/secretaria) |
| User.school | String livre | FK para tabela Organization |
| MaterialChunk | Sem ownership organizacional | organizationId + visibility |
| QuestionBank | Sem ownership | organizationId + visibility |
| Descritores | Globais | Globais + customizaveis por org |

**Redundancia de dados:** A estrutura atual de Evaluation → Theme → Descriptor NAO gera redundancia para multitenancy porque descritores sao globais (SPAECE/SAEB sao padronizados). O que precisa de isolamento sao os **materiais** e **questoes do banco**.

---

### 1.3 Performance das Queries Vetoriais

**Query atual do retriever:**
```sql
SELECT content, source_type, descriptor_code,
       1 - (embedding <=> $vector::vector) AS similarity
FROM material_chunks
WHERE embedding IS NOT NULL
  AND (descriptor_code = $code
       OR (subject_slug = $sub AND grade_level_slug = $grade))
ORDER BY embedding <=> $vector::vector
LIMIT 5
```

**Debitos tecnicos identificados:**
1. Sem indice HNSW → scan sequencial O(n)
2. Filtro OR com metadata → nao pode usar indice vetorial eficientemente
3. Sem pre-filtragem antes da busca vetorial
4. Calcula distancia para TODOS os rows antes do LIMIT

**Recomendacao:** Usar estrategia de pre-filtragem + HNSW:
```sql
-- Criar view materializada ou CTE com pre-filtro
WITH filtered AS (
  SELECT * FROM material_chunks
  WHERE embedding IS NOT NULL
    AND (descriptor_code = $code
         OR (subject_slug = $sub AND grade_level_slug = $grade))
)
SELECT content, source_type, descriptor_code,
       1 - (embedding <=> $vector::vector) AS similarity
FROM filtered
ORDER BY embedding <=> $vector::vector
LIMIT 5;
```

---

## 2. Estrategia de Dados e Vetorizacao

### 2.1 Scraping vs. Ingestao: Separar?

**STATUS (2026-03-08): IMPLEMENTADO — pipeline batch de arquivos separa as fases.**

A separacao entre scan e ingestao foi implementada no pipeline de scraping batch de arquivos (PDF/DOCX/TXT). Veja a comparacao entre o pipeline antigo e o novo:

| Aspecto | Scraping HTML (Original) | Scraping Batch de Arquivos (Novo) |
|---------|--------------------------|-----------------------------------|
| Responsabilidade | Extrair texto da pagina | Fase 1: detectar links | Fase 2: baixar + ingerir |
| Revisao pelo admin | Sim (edita texto) | Sim (seleciona arquivos via checkbox) |
| Auditoria | Nenhuma | Tabela `scraped_sources` + disco local |
| Formatos | Texto HTML | PDF, DOCX, TXT |
| Limite | 50k chars | 20 arquivos por chamada, 30s/arquivo |

**Arquitetura implementada (batch de arquivos):**
```
Admin UI → POST /api/admin/scrape-files → Retorna lista de arquivos encontrados
                                               ↓
Admin seleciona arquivos + metadata
                                               ↓
              POST /api/admin/scrape-files/ingest
                                               ↓
                               Para cada arquivo:
                               1. Download (fetch, 30s timeout)
                               2. Salva em storage/provas-scraped/
                               3. Extrai texto (pdf-parse / mammoth)
                               4. Chunk + embed + INSERT pgvector
                               5. Registra em scraped_sources (auditoria)
                                               ↓
                               Retorna { results[], summary }
```

**O que ainda falta para a arquitetura ideal:**
- Ingestao nao bloqueia request HTTP (hoje bloqueia ~10-30s para PDFs grandes — sem fila Redis/BullMQ ainda)
- Worker com retry automatico em falhas de embedding
- Notificacao ao admin via SSE/webhook ao concluir
- Rate limiting no endpoint

**Recomendacao futura: Fila BullMQ**
```
Admin confirma → POST /api/admin/scrape-files/ingest → Enfileira job no Redis (BullMQ)
                                                             ↓
                                              Worker processa em background:
                                              1. Download + extracao
                                              2. Embeddings (batch)
                                              3. INSERT pgvector
                                              4. Notifica admin (SSE/webhook)
```

---

### 2.2 Segmentacao de Vetores: Tabela Unica vs. Separada

**RECOMENDACAO: TABELA UNICA com metadata filtering.**

**Por que NAO separar em colecoes:**
- pgvector nao suporta "colecoes" como Qdrant/Pinecone
- Criar tabelas separadas (`material_chunks_simulados`, `material_chunks_provas`, `material_chunks_atividades`) causaria:
  - Duplicacao de schema
  - Queries cross-table complexas
  - Indices HNSW separados (mais memoria)
  - Codigo de ingestao duplicado

**Por que SIM metadata filtering:**
- Uma tabela, um indice HNSW
- Filtro por `content_purpose` (referencia, exercicio, exemplo, definicao)
- Filtro por `evaluation_slug`, `subject_slug`, `grade_level_slug`
- pgvector com pre-filtragem funciona bem ate ~1M rows

**Schema recomendado para suportar todos os tipos:**
```sql
ALTER TABLE material_chunks ADD COLUMN content_purpose VARCHAR;
-- Valores: 'reference', 'exercise', 'example', 'definition', 'exam_question'
-- 'reference'     → usado para contexto RAG de Simulados
-- 'exercise'      → usado para Atividades
-- 'exam_question' → questoes reais de provas anteriores (Provas)

ALTER TABLE material_chunks ADD COLUMN content_area VARCHAR;
-- Valores: 'algebra', 'geometry', 'statistics', 'reading', 'writing'
-- Granularidade extra para filtros

ALTER TABLE material_chunks ADD COLUMN education_level VARCHAR;
-- Valores: 'fundamental_1', 'fundamental_2', 'medio', 'superior'
```

---

### 2.3 Granularidade de Metadados para Filtros Performaticos

**Estrutura recomendada de filtros hierarquicos:**

```
Nivel 1: education_level (fundamental_1, fundamental_2, medio, superior)
  └─ Nivel 2: grade_level_slug (1_ano ... 9_ano, 1_serie ... 3_serie)
       └─ Nivel 3: subject_slug (matematica, portugues, ciencias, ...)
            └─ Nivel 4: content_area (algebra, geometria, estatistica, ...)
                 └─ Nivel 5: descriptor_code (D07, D17, ...)
                      └─ Nivel 6: difficulty (facil, medio, dificil)
```

**Indices compostos recomendados:**
```sql
-- Indice para busca por nivel + serie + disciplina (cobertura de 80% das queries)
CREATE INDEX idx_chunks_level_grade_subject
  ON material_chunks(education_level, grade_level_slug, subject_slug);

-- Indice para busca por descritor (cobertura de 95% das queries de geracao)
CREATE INDEX idx_chunks_descriptor
  ON material_chunks(descriptor_code)
  WHERE descriptor_code IS NOT NULL;

-- Indice parcial para chunks com embedding (evita scan em chunks sem embedding)
CREATE INDEX idx_chunks_has_embedding
  ON material_chunks(id)
  WHERE embedding IS NOT NULL;
```

**Performance esperada:**
- Com 100k chunks e indices compostos: <10ms para pre-filtragem
- Com HNSW no subset filtrado: <5ms para top-5 similarity
- Total: <20ms por query RAG (vs. atuais ~50-500ms sem indices)

---

## 3. Persistencia e Otimizacao de Custos

### 3.1 Custo Atual por Simulado (26 questoes)

| Componente | Calls | Input Tokens | Output Tokens | Custo |
|-----------|-------|-------------|--------------|-------|
| Geracao (gpt-4o-mini) | 26 × 2.3 avg | ~66,000 | ~13,500 | $0.018 |
| Validacao (gpt-4o-mini) | 26 × 1 | ~13,000 | ~1,700 | $0.003 |
| Embeddings (text-embedding-3-small) | 26 | ~520 | - | $0.00001 |
| **TOTAL** | **~86** | **~79,500** | **~15,200** | **~$0.021** |

**Projecao de custos:**

| Volume | Custo Mensal IA | Creditos Gratis (10/user) |
|--------|----------------|--------------------------|
| 100 simulados/mes | R$ 12 | Sustentavel |
| 1.000 simulados/mes | R$ 120 | Requer otimizacao |
| 5.000 simulados/mes | R$ 600 | Critico sem cache |
| 10.000 simulados/mes | R$ 1.200 | Insustentavel sem banco |

---

### 3.2 Estrategia de Cache e Reaproveitamento

#### O QuestionBank existe mas NUNCA e consultado

**Problema encontrado:** O modelo `QuestionBank` recebe questoes geradas (`fire-and-forget` no gerar/route.ts), mas **nenhum codigo consulta essa tabela** antes de gerar novas questoes. E um banco de dados em write-only.

**Solucao: Pipeline Hibrido (Banco + RAG)**

```
Pedido de questao para descritor D07
         |
         v
    1. Buscar no QuestionBank
       (similarity search no embedding da questao)
         |
    +---------+---------+
    |                   |
    v                   v
  Encontrou            Nao encontrou
  (similarity > 0.85)  (ou banco vazio)
    |                   |
    v                   v
  Retorna questao      Gera com LLM
  do banco             (pipeline atual)
  (custo: $0)             |
                          v
                       Salva no QuestionBank
                       (para reuso futuro)
```

**Implementacao:**
```typescript
async function getOrGenerateQuestion(input: QuestionGeneratorInput) {
  // 1. Tentar buscar questao existente
  const existing = await findSimilarQuestion(
    input.descriptorCode,
    input.difficulty,
    input.gradeLevelSlug
  );

  if (existing && existing.qualityScore >= 0.8) {
    await prisma.questionBank.update({
      where: { id: existing.id },
      data: { timesUsed: { increment: 1 } }
    });
    return mapToGeneratedQuestion(existing);
  }

  // 2. Gerar nova questao
  const question = await generateQuestion(input);

  // 3. Salvar para reuso futuro
  await saveToQuestionBank(question, input.descriptorId);

  return question;
}
```

**Economia projetada:**
- Apos 500 simulados: banco tera ~13.000 questoes
- Taxa de reuso estimada: 30-50% (descritores se repetem)
- Economia: 30-50% dos custos LLM = **R$ 36-60/mes a 1000 simulados**

---

### 3.3 Integracao de Questoes Estaticas (PDF/Scraping) com Dinamicas (RAG)

**Fluxo recomendado para composicao hibrida:**

```
Criacao de Prova/Simulado
         |
         v
  Distribuicao de descritores:
  { D07: 3 questoes, D17: 2 questoes }
         |
    Para cada questao:
         |
    +----+----+----+
    |              |
    v              v
  Banco de       Gerar com
  Questoes       LLM + RAG
  (estaticas)    (dinamicas)
    |              |
    v              v
  Aleatorizar    Validar
  opcoes         com LLM
    |              |
    +------+-------+
           |
           v
    Montar prova final
    (mix estaticas + dinamicas)
```

**Schema para questoes estaticas (extraidas de provas reais):**
```sql
ALTER TABLE question_bank ADD COLUMN source_origin VARCHAR;
-- Valores: 'generated' (IA), 'extracted' (PDF/scraping), 'manual' (professor)

ALTER TABLE question_bank ADD COLUMN source_exam VARCHAR;
-- Ex: "SPAECE 2023 - 9o ano - Matematica"

ALTER TABLE question_bank ADD COLUMN is_verified BOOLEAN DEFAULT false;
-- Questoes extraidas precisam verificacao humana
```

**Logica de aleatorização:**
```typescript
async function composeExam(descriptors: DescriptorRequest[]) {
  const questions = [];

  for (const desc of descriptors) {
    const { descriptorId, questionCount, allowBankQuestions = true } = desc;

    if (allowBankQuestions) {
      // Buscar questoes do banco (estaticas + dinamicas anteriores)
      const bankQuestions = await findBankQuestions(descriptorId, questionCount);
      questions.push(...bankQuestions);

      // Gerar o restante com IA
      const remaining = questionCount - bankQuestions.length;
      if (remaining > 0) {
        const generated = await generateBatch(descriptorId, remaining);
        questions.push(...generated);
      }
    } else {
      // Apenas questoes novas
      const generated = await generateBatch(descriptorId, questionCount);
      questions.push(...generated);
    }
  }

  // Shuffle final para misturar origens
  return shuffleArray(questions);
}
```

---

### 3.4 Otimizacoes de Token Imediatas

| Otimizacao | Esforco | Economia/mes (1k sim) |
|-----------|---------|----------------------|
| Usar `response_format: "json_object"` no gpt-4o-mini | 1 hora | R$ 70 (elimina retries JSON) |
| Cache de embeddings por descritor (Map in-memory) | 2 horas | R$ 5 |
| Consultar QuestionBank antes de gerar | 3 dias | R$ 36-60 |
| Reduzir RAG chunks de 5 para 3 | 30 min | R$ 8 |
| Condensar prompt (-600 tokens) | 2 horas | R$ 15 |
| **TOTAL** | **~4 dias** | **R$ 134-158** |

---

## 4. Seguranca, Tradeoffs e Melhorias

### 4.1 Seguranca

#### Isolamento de Dados entre Professores

**Estado atual:** NENHUM isolamento alem de `exam.userId`.
- Qualquer professor ve todos os descritores (ok, sao publicos)
- MaterialChunk nao tem ownership organizacional
- QuestionBank nao tem visibilidade controlada

**Solucao: Modelo de 3 niveis de visibilidade**

```
PRIVADO: Apenas o professor que criou
  → Exams, suas questoes geradas

ORGANIZACAO: Todos da mesma escola/secretaria
  → MaterialChunks da escola
  → QuestionBank da escola (aprovadas)

PUBLICO: Todos os usuarios
  → Descritores oficiais (SPAECE/SAEB/BNCC)
  → Materiais publicados pela plataforma
```

**Implementacao com Row-Level Security (PostgreSQL):**
```sql
-- Habilitar RLS nas tabelas sensiveis
ALTER TABLE material_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;

-- Policy: usuario ve chunks da sua org + publicos
CREATE POLICY chunks_access ON material_chunks
  USING (
    visibility = 'public'
    OR organization_id = current_setting('app.organization_id')::uuid
  );
```

#### Conformidade Legal (LGPD)

**Pontos de atencao:**
1. `User.email` e dado pessoal - precisa de consentimento explicito
2. `Exam.teacherName` e dado pessoal em contexto profissional
3. Questoes geradas podem conter dados sensíveis se o material ingerido contiver
4. Scraping de paginas pode violar termos de uso dos sites

**Recomendacoes:**
- Adicionar termo de consentimento no registro
- Permitir export/delete de dados do usuario (LGPD Art. 18)
- Sanitizar conteudo ingerido (remover nomes, CPFs, dados pessoais)
- Registrar log de acesso a dados pessoais

---

### 4.2 Vulnerabilidades de Seguranca Encontradas

| Severidade | Problema | Arquivo | Correcao |
|-----------|---------|---------|----------|
| ALTA | Sem rate limiting em nenhum endpoint | Todos os routes | Implementar com Redis + middleware |
| ALTA | Download de arquivo sem limite de tamanho | `api/admin/scrape-files/ingest/route.ts` | Validar `Content-Length` < 50MB antes de buffer |
| ALTA | Download sem validacao real de MIME type | `api/admin/scrape-files/ingest/route.ts` | Verificar magic bytes do buffer, nao apenas extensao da URL |
| ALTA | Upload de arquivo sem limite de tamanho | `api/admin/ingest/route.ts` | Validar `file.size` < 50MB |
| MEDIA | Sem logging de erros (catch vazio) | Multiplos | Integrar Sentry/Pino |
| MEDIA | NextAuth em versao beta (5.0.0-beta.30) | `package.json` | Monitorar breaking changes |
| MEDIA | fire-and-forget sem logging | `gerar/route.ts` L294 | Adicionar `.catch(console.error)` |
| BAIXA | Sem validacao Zod em descriptorDistribution JSON | `gerar/route.ts` | Adicionar schema Zod |
| BAIXA | SSRF parcial: apenas IPs literais sao bloqueados | `scrape-files/route.ts` + `ingest/route.ts` | Resolver DNS antes de bloquear (ex: `169.254.x.x`, IPs privados via range check) |

---

### 4.3 Tradeoffs: Banco Vetorial Unico vs. Separado por Nivel

#### Opcao A: Banco Unico (RECOMENDADO)

| Pro | Contra |
|-----|--------|
| Schema simples, 1 indice HNSW | Indice HNSW maior (mais RAM) |
| Busca cross-level possivel | Queries mais lentas com >1M rows |
| Ingestao padronizada | Metadata filtering essencial |
| Backup/restore simplificado | Sem isolamento natural de dados |
| Custo operacional menor | Precisa de indices compostos bons |

**Quando escala bem:** Ate ~1M chunks com HNSW + pre-filtragem
**Quando quebra:** Acima de 5M chunks sem particionar

#### Opcao B: Banco Separado por Nivel Escolar

| Pro | Contra |
|-----|--------|
| Indices menores e mais rapidos | N tabelas para manter (schema drift) |
| Isolamento natural | Cross-level queries impossíveis |
| Scaling horizontal facilitado | Codigo de ingestao duplicado |
| Cache mais eficiente por nivel | Operacional mais complexo |

**Quando faz sentido:** Acima de 5M chunks total OU quando existem requisitos regulatorios de isolamento por nivel.

#### VEREDICTO: Banco Unico com Particionamento Futuro

Comece com tabela unica. Quando atingir 1M+ rows, particione por `education_level`:
```sql
-- Particionamento por nivel (futuro)
CREATE TABLE material_chunks (
  ...
) PARTITION BY LIST (education_level);

CREATE TABLE material_chunks_fund1 PARTITION OF material_chunks
  FOR VALUES IN ('fundamental_1');
CREATE TABLE material_chunks_fund2 PARTITION OF material_chunks
  FOR VALUES IN ('fundamental_2');
CREATE TABLE material_chunks_medio PARTITION OF material_chunks
  FOR VALUES IN ('medio');
```

---

## 5. Roadmap Tecnico de Refatoracao

### Fase 0: Implementado em 2026-03-08

| # | Entregavel | Descricao | Status |
|---|-----------|-----------|--------|
| 0.1 | `ScrapedSource` model | Novo modelo Prisma para auditoria de scraping | ✅ Concluido |
| 0.2 | `POST /api/admin/scrape-files` | Escanear pagina e listar arquivos linkados | ✅ Concluido |
| 0.3 | `GET /api/admin/scrape-files` | Listar historico de fontes raspadas | ✅ Concluido |
| 0.4 | `DELETE /api/admin/scrape-files?id=` | Remover fonte + chunks do RAG | ✅ Concluido |
| 0.5 | `POST /api/admin/scrape-files/ingest` | Download + extracao + ingestao batch | ✅ Concluido |
| 0.6 | UI de 2 abas em `/admin/scraping` | Aba HTML + Aba Batch de Arquivos | ✅ Concluido |
| 0.7 | Storage local de arquivos | `storage/provas-scraped/{ts}_{name}` | ✅ Concluido |
| 0.8 | `npx prisma db push` + `npx prisma generate` | Schema sincronizado, TS limpo | ✅ Concluido |

---

### Fase 1: Correcoes Criticas (1-2 semanas)

**Objetivo:** Prevenir falhas antes que o volume aumente.

| # | Tarefa | Arquivo | Prioridade | Esforco |
|---|--------|---------|-----------|---------|
| 1 | Criar indices HNSW + metadata no pgvector | `prisma/schema.prisma` + migration SQL | CRITICA | 2h |
| 2 | Corrigir race condition de creditos (Serializable) | `src/lib/billing/credits.ts` | CRITICA | 4h |
| 3 | Batch INSERT na ingestao (eliminar N+1) | `src/lib/ai/rag/ingest.ts` | ALTA | 4h |
| 4 | Configurar connection pool do Prisma | `src/lib/db/prisma.ts` | ALTA | 1h |
| 5 | Adicionar `response_format: "json_object"` no LLM | `src/lib/ai/agents/question-generator.ts` | ALTA | 1h |
| 6 | Validacao de tamanho/tipo de arquivo em upload + download | `api/admin/ingest/route.ts` + `api/admin/scrape-files/ingest/route.ts` | ALTA | 3h |
| 7 | Adicionar logging estruturado (Pino/Winston) | Global | MEDIA | 4h |

---

### Fase 2: Otimizacao de Custos (2-3 semanas)

**Objetivo:** Reduzir custos de IA em 50%+ para escalar.

| # | Tarefa | Impacto |
|---|--------|---------|
| 8 | Implementar consulta ao QuestionBank ANTES de gerar | -30-50% custo LLM |
| 9 | Cache de embeddings por descritor (in-memory) | -5% custo embeddings |
| 10 | Otimizar prompts (-600 tokens por questao) | -12% custo LLM |
| 11 | Integrar Redis para cache de descritores | -latencia, -queries DB |
| 12 | Rate limiting por usuario com Redis | Seguranca |

---

### Fase 3: Escalabilidade do Schema (3-4 semanas)

**Objetivo:** Suportar multiplos niveis, series e frameworks.

| # | Tarefa | Mudanca |
|---|--------|---------|
| 13 | Adicionar modelo `Organization` (multi-tenancy) | Nova tabela + FKs |
| 14 | Adicionar `education_level` e `content_area` ao MaterialChunk | ALTER TABLE |
| 15 | Adicionar `ExamType` (simulado/prova/atividade) | Nova tabela + FK no Exam |
| 16 | Expandir GradeLevel para todos os niveis | Seed data |
| 17 | Expandir Subject para todas as disciplinas | Seed data |
| 18 | Tornar prompts dinamicos por framework (ENEM/BNCC) | Refatorar prompts.ts |
| 19 | Adicionar visibilidade (private/org/public) a MaterialChunk e QuestionBank | ALTER TABLE |
| 20 | Migrar de `prisma db push` para `prisma migrate` | Infraestrutura |

---

### Fase 4: Producao e Resiliencia (4-6 semanas)

**Objetivo:** Preparar para trafego real.

| # | Tarefa | Detalhe |
|---|--------|---------|
| 21 | Mover geracao de questoes para background job (BullMQ) | Redis + Worker |
| 22 | Implementar streaming de PDF (nao buffered) | Performance |
| 23 | Implementar Row-Level Security no PostgreSQL | Seguranca |
| 24 | Adicionar monitoramento (Sentry + metricas) | Observabilidade |
| 25 | Implementar fila BullMQ para scraping batch | Hoje bloqueia HTTP; mover para background worker |
| 26 | Webhook Stripe funcional | Billing |
| 27 | Testes automatizados (unit + integration) | Qualidade |

---

### Diagrama de Arquitetura Futura

```
                    +------------------+
                    |   Admin Panel    |
                    | (Scraping + RAG) |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Next.js API    |
                    |   (App Router)   |
                    +--+-----+-----+--+
                       |     |     |
              +--------+  +--+--+  +--------+
              |           |     |           |
     +--------v---+ +-----v--+ +---v-------+
     |  Redis     | | Prisma | |  BullMQ   |
     | - Cache    | | - ORM  | |  Workers  |
     | - Rate Lim | | - Pool | |           |
     | - Sessions | +---+----+ +-----+-----+
     +------------+     |           |
                   +----v-----------v----+
                   |    PostgreSQL 16    |
                   | +----------------+ |
                   | | Tabelas Prisma | |
                   | +----------------+ |
                   | | pgvector HNSW  | |
                   | +----------------+ |
                   | | RLS Policies   | |
                   | +----------------+ |
                   +---------------------+
                             |
                    +--------v---------+
                    |    OpenAI API    |
                    | - gpt-4o-mini   |
                    | - embeddings    |
                    +-----------------+
```

---

### Metricas de Sucesso

| Metrica | Atual (estimado) | Pos-Fase 1 | Pos-Fase 4 |
|---------|-----------------|------------|------------|
| Query RAG (latencia) | 50-500ms | <20ms | <10ms |
| Geracao 26 questoes | ~120s | ~90s | ~60s (com cache) |
| Custo por simulado | R$ 0,12 | R$ 0,10 | R$ 0,06 |
| Usuarios concorrentes | ~5 (pool 10) | ~20 (pool 20) | ~100+ (workers) |
| Max chunks suportados | ~10k (seq scan) | ~500k (HNSW) | ~5M (partitioned) |
| Tempo de ingestao (100 chunks) | ~10s (N+1) | ~1s (batch) | <0.5s (queued) |
| Ingestao de PDF (5 arquivos) | ~60-150s (sincrono, bloqueia HTTP) | ~60s (sincrono + batch INSERT) | <5s (background BullMQ) |

---

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-08 | Criacao do documento inicial (auditoria + roadmap) |
| 2026-03-08 | Implementacao do pipeline batch de scraping de arquivos (PDF/DOCX/TXT): `ScrapedSource` model, rotas `scrape-files` e `scrape-files/ingest`, UI de 2 abas, storage local. Schema sincronizado com `prisma db push`. Fase 0 do roadmap concluida. |
