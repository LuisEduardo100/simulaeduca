# SimulaEduca - Guia Completo do Projeto

## O que é o SimulaEduca?

O **SimulaEduca** é uma plataforma web de geração inteligente de simulados educacionais, voltada para avaliações como **SPAECE** e **SAEB**. Professores podem criar exames personalizados com questões geradas por IA, alinhadas aos descritores da BNCC, com exportação em PDF.

### Visão Geral da Arquitetura

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **Banco de dados**: PostgreSQL 16 com pgvector (busca semântica)
- **ORM**: Prisma 7
- **IA**: OpenAI GPT-4o (geração), GPT-4o-mini (validação), text-embedding-3-small (embeddings)
- **Autenticação**: NextAuth.js v5 (Google OAuth + credenciais)
- **UI**: Tailwind CSS 4 + shadcn/ui + Radix UI + Lucide Icons
- **PDF**: @react-pdf/renderer
- **Pagamentos**: Stripe (planejado)
- **Cache**: Redis 7
- **Deploy**: Docker Compose (PostgreSQL + Redis)

---

## Estrutura de Diretórios

```
simulaeduca/
├── docker/                    # Docker configs (init.sql)
├── prisma/
│   ├── schema.prisma          # Schema do banco de dados
│   ├── migrations/            # Migrações (vazio)
│   └── seed/                  # Dados iniciais
│       ├── seed.ts
│       ├── plans.json
│       └── descriptors-spaece-mat-9ano.json
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Layout raiz (SessionProvider)
│   │   ├── page.tsx                    # Landing page
│   │   ├── globals.css                 # Estilos globais
│   │   ├── (auth)/                     # Páginas de autenticação
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── redefinir-senha/page.tsx
│   │   ├── (dashboard)/               # Área autenticada
│   │   │   ├── layout.tsx             # Layout com sidebar
│   │   │   ├── dashboard/page.tsx     # Dashboard principal
│   │   │   ├── simulados/
│   │   │   │   ├── novo/page.tsx      # Criar simulado
│   │   │   │   ├── historico/page.tsx # Histórico
│   │   │   │   └── [id]/page.tsx      # Detalhe do simulado
│   │   │   ├── creditos/page.tsx      # Gerenciar créditos
│   │   │   ├── configuracoes/page.tsx # Configurações do perfil
│   │   │   └── admin/                 # Área administrativa
│   │   │       ├── knowledge-base/page.tsx  # Base de conhecimento RAG
│   │   │       └── scraping/page.tsx        # Web scraping
│   │   └── api/                       # Rotas da API
│   │       ├── auth/
│   │       │   ├── [...nextauth]/route.ts
│   │       │   ├── register/route.ts
│   │       │   └── reset-password/route.ts
│   │       ├── simulados/
│   │       │   ├── route.ts           # CRUD de simulados
│   │       │   ├── gerar/route.ts     # Geração com IA
│   │       │   └── pdf/route.ts       # Download PDF
│   │       ├── descritores/route.ts   # Listagem de descritores
│   │       ├── creditos/route.ts      # Saldo e transações
│   │       ├── user/profile/route.ts  # Perfil do usuário
│   │       ├── admin/
│   │       │   ├── scrape/route.ts    # Web scraping
│   │       │   └── ingest/route.ts    # Ingestão RAG
│   │       └── webhooks/stripe/route.ts # Webhook Stripe (TODO)
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx            # Sidebar desktop
│   │   │   └── MobileNav.tsx          # Navegação mobile
│   │   └── simulado/
│   │       ├── SimuladoForm.tsx        # Formulário de criação
│   │       └── DescriptorSelect.tsx    # Seletor de descritores
│   ├── lib/
│   │   ├── utils.ts                   # cn() para classes Tailwind
│   │   ├── utils/
│   │   │   ├── auth.ts                # Config NextAuth completa
│   │   │   ├── auth.config.ts         # Config NextAuth (edge/middleware)
│   │   │   └── constants.ts           # Constantes globais
│   │   ├── db/
│   │   │   └── prisma.ts             # Cliente Prisma singleton
│   │   ├── ai/
│   │   │   ├── index.ts              # Entry point (placeholder)
│   │   │   ├── agents/
│   │   │   │   ├── question-generator.ts  # Geração de questões
│   │   │   │   ├── question-validator.ts  # Validação de questões
│   │   │   │   └── exam-formatter.ts      # Formatação (TODO)
│   │   │   └── rag/
│   │   │       ├── embeddings.ts      # Geração de embeddings
│   │   │       ├── ingest.ts          # Ingestão de materiais
│   │   │       ├── retriever.ts       # Busca semântica
│   │   │       ├── prompts.ts         # Prompts para IA
│   │   │       └── extractors.ts      # Extração PDF/DOCX/TXT
│   │   ├── billing/
│   │   │   ├── credits.ts            # Gestão de créditos
│   │   │   ├── stripe.ts             # Stripe (TODO)
│   │   │   └── plans.ts              # Planos (TODO)
│   │   └── pdf/
│   │       └── generator.ts          # Geração de PDF
│   ├── types/
│   │   └── index.ts                  # Tipos TypeScript globais
│   └── middleware.ts                  # Proteção de rotas
├── docker-compose.yml
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Banco de Dados - Modelos e Tabelas

### Diagrama de Relacionamentos

```
User ─────┬──── Account (OAuth)        [1:N, cascade delete]
          ├──── Session                 [1:N, cascade delete]
          ├──── Exam ──── ExamQuestion  [1:N → 1:N, cascade delete]
          ├──── CreditTransaction       [1:N]
          └──── MaterialChunk           [1:N]

Evaluation ─┬── Theme ── Descriptor ─┬── ExamQuestion
Subject ────┤                        └── QuestionBank
GradeLevel ─┘

Plan (standalone, sem FK)
VerificationToken (standalone, sem FK)
```

### Tabelas Detalhadas

#### `users` - Usuários
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK, gen_random_uuid() |
| email | String | Único |
| name | String? | Nome completo |
| emailVerified | DateTime? | Verificação de email |
| image | String? | Avatar (Google) |
| role | String | "teacher" / "admin" / "coordinator" |
| school | String? | Escola |
| city | String? | Cidade |
| state | Char(2)? | Estado (ex: "CE") |
| passwordHash | String? | Hash bcrypt |
| planType | String | "free" / "basic" / "pro" / "school" / "secretaria" |
| creditsBalance | Int | Padrão: 10 |
| stripeCustomerId | String? | ID Stripe |
| createdAt | DateTime | Criação |
| updatedAt | DateTime | Atualização |

#### `accounts` - Contas OAuth
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | CUID | PK |
| userId | UUID | FK → users |
| type | String | Tipo (oauth, oidc) |
| provider | String | Provedor (google) |
| providerAccountId | String | ID no provedor |
| refresh_token | Text? | Token de refresh |
| access_token | Text? | Token de acesso |
| expires_at | Int? | Expiração |
| token_type | String? | Tipo do token |
| scope | String? | Escopos OAuth |
| id_token | Text? | Token OpenID |
| **Unique** | | [provider, providerAccountId] |

#### `sessions` - Sessões
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | CUID | PK |
| sessionToken | String | Token único |
| userId | UUID | FK → users |
| expires | DateTime | Expiração |

#### `verification_tokens` - Tokens de Verificação
| Campo | Tipo | Descrição |
|-------|------|-----------|
| identifier | String | Email |
| token | String | Token único |
| expires | DateTime | Expiração |
| **PK** | | [identifier, token] |

#### `subjects` - Disciplinas
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | Int | PK, auto |
| name | String | Ex: "Matemática" |
| slug | String | Único, ex: "matematica" |

#### `grade_levels` - Séries/Anos
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | Int | PK, auto |
| name | String | Ex: "9º ano" |
| slug | String | Único, ex: "9_ano" |
| level | String | "fundamental" / "medio" |

#### `evaluations` - Avaliações
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | Int | PK, auto |
| name | String | Ex: "SPAECE" |
| slug | String | Único, ex: "spaece" |

#### `themes` - Temas/Eixos
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | Int | PK, auto |
| evaluationId | Int | FK → evaluations |
| subjectId | Int | FK → subjects |
| gradeLevelId | Int | FK → grade_levels |
| name | String | Ex: "Interagindo com Números e Funções" |
| romanNumeral | String? | Ex: "I", "II" |

#### `descriptors` - Descritores BNCC
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | Int | PK, auto |
| code | String | Ex: "D07", "D25" |
| description | String | Texto do descritor |
| themeId | Int | FK → themes |
| evaluationId | Int | FK → evaluations |
| subjectId | Int | FK → subjects |
| gradeLevelId | Int | FK → grade_levels |
| **Unique** | | [code, evaluationId, subjectId, gradeLevelId] |

#### `exams` - Simulados
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK |
| userId | UUID | FK → users |
| title | String | Título do simulado |
| teacherName | String | Nome do professor |
| schoolName | String? | Escola |
| evaluationId | Int | FK → evaluations |
| subjectId | Int | FK → subjects |
| gradeLevelId | Int | FK → grade_levels |
| status | String | "draft" / "generating" / "completed" / "failed" |
| totalQuestions | Int | Padrão: 0 |
| creditsConsumed | Int | Padrão: 0 |
| pdfUrl | String? | URL do PDF |
| answerSheetUrl | String? | URL da folha de respostas |
| answerKeyUrl | String? | URL do gabarito |
| createdAt | DateTime | Criação |
| completedAt | DateTime? | Conclusão |

#### `exam_questions` - Questões do Simulado
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK |
| examId | UUID | FK → exams (cascade delete) |
| questionNumber | Int | Número da questão |
| descriptorId | Int | FK → descriptors |
| stem | String | Enunciado |
| optionA-D | String | Alternativas A, B, C, D |
| correctAnswer | Char(1) | "A" / "B" / "C" / "D" |
| justification | String? | Justificativa |
| difficulty | String | "facil" / "medio" / "dificil" |
| hasImage | Boolean | Padrão: false |
| imageDescription | String? | Descrição da imagem |
| generationModel | String? | Ex: "gpt-4o" |
| createdAt | DateTime | Criação |

#### `credit_transactions` - Transações de Crédito
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK |
| userId | UUID | FK → users |
| amount | Int | Positivo = adição, negativo = consumo |
| type | String | "purchase" / "subscription" / "usage" / "bonus" |
| description | String? | Descrição |
| examId | UUID? | FK → exams |
| stripePaymentId | String? | Referência Stripe |
| createdAt | DateTime | Criação |

#### `plans` - Planos de Assinatura
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | Int | PK, auto |
| name | String | Ex: "Gratuito", "Pro" |
| slug | String | "free" / "basic" / "pro" / "school" / "secretaria" |
| priceMonthly | Decimal? | Preço mensal |
| creditsMonthly | Int? | Créditos/mês |
| maxQuestionsPerExam | Int? | Limite de questões |
| stripePriceId | String? | ID do preço no Stripe |
| features | Json? | Funcionalidades do plano |
| isActive | Boolean | Padrão: true |

**Planos Seedados:**
| Plano | Preço | Créditos/mês | Questões/exame | Marca d'água |
|-------|-------|--------------|----------------|--------------|
| Free | R$0 | 10 | 5 | Sim |
| Basic | R$29,90 | 100 | 15 | Não |
| Pro | R$69,90 | 500 | 30 | Não |
| School | R$199,90 | 2.000 | 50 | Não |

#### `material_chunks` - Base de Conhecimento RAG
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK |
| content | String | Texto do chunk |
| sourceType | String | "pdf" / "docx" / "txt" / "text" |
| sourceFileName | String? | Nome do arquivo original |
| descriptorCode | String? | Ex: "D07" |
| subjectSlug | String? | Ex: "matematica" |
| gradeLevelSlug | String? | Ex: "9_ano" |
| evaluationSlug | String? | Ex: "spaece" |
| difficulty | String? | "facil" / "medio" / "dificil" |
| chunkIndex | Int | Posição no documento |
| totalChunks | Int | Total de chunks da fonte |
| uploadedBy | UUID | FK → users |
| embedding | vector(1536)? | Embedding OpenAI |
| createdAt | DateTime | Criação |

#### `question_bank` - Banco de Questões
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK |
| descriptorId | Int | FK → descriptors |
| stem | String | Enunciado |
| optionA-D | String | Alternativas |
| correctAnswer | Char(1) | Resposta correta |
| justification | String? | Justificativa |
| difficulty | String? | Dificuldade |
| qualityScore | Decimal(3,2)? | Score de qualidade (0-1) |
| timesUsed | Int | Padrão: 0 |
| flagged | Boolean | Padrão: false |
| embedding | vector(1536)? | Embedding para busca semântica |
| createdAt | DateTime | Criação |

---

## Rotas da API (21 endpoints)

### Autenticação
| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET/POST | `/api/auth/[...nextauth]` | Handlers NextAuth (login, logout, session) | Público |
| POST | `/api/auth/register` | Registrar novo usuário | Público |
| POST | `/api/auth/reset-password` | Redefinir senha | Público |

### Simulados
| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/api/simulados` | Listar simulados do usuário (paginado) | Autenticado |
| POST | `/api/simulados` | Criar simulado rascunho | Autenticado |
| POST | `/api/simulados/gerar` | Gerar questões com IA | Autenticado |
| GET | `/api/simulados/pdf` | Baixar PDF (prova ou gabarito) | Autenticado |

### Descritores
| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/api/descritores` | Listar descritores filtrados | Autenticado |

### Créditos
| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/api/creditos` | Saldo e histórico de transações | Autenticado |

### Perfil
| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/api/user/profile` | Dados do perfil | Autenticado |
| PATCH | `/api/user/profile` | Atualizar perfil | Autenticado |

### Admin
| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| POST | `/api/admin/scrape` | Extrair texto de URL | Admin |
| GET | `/api/admin/ingest` | Listar materiais indexados | Admin |
| POST | `/api/admin/ingest` | Ingerir material (arquivo ou texto) | Admin |
| DELETE | `/api/admin/ingest` | Remover material | Admin |

### Webhooks
| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| POST | `/api/webhooks/stripe` | Webhook Stripe (TODO) | Público |

---

## Serviços e Módulos

### Pipeline RAG (Retrieval-Augmented Generation)

```
Material (PDF/DOCX/TXT/URL)
    ↓
[extractors.ts] → Extrai texto puro
    ↓
[ingest.ts] → Divide em chunks (1000 chars, 100 overlap)
    ↓
[embeddings.ts] → Gera vetores (text-embedding-3-small, 1536 dims)
    ↓
PostgreSQL pgvector (tabela material_chunks)

Geração de Questão:
    ↓
[retriever.ts] → Busca chunks relevantes (cosine similarity)
    ↓
[prompts.ts] → Monta prompt estruturado
    ↓
[question-generator.ts] → GPT-4o gera questão (JSON)
    ↓
[question-validator.ts] → GPT-4o-mini valida (estrutural + semântico)
    ↓
Questão validada → ExamQuestion + QuestionBank
```

### Sistema de Créditos (`billing/credits.ts`)
- `getUserCredits(userId)` → Consulta saldo
- `hasEnoughCredits(userId, amount)` → Verifica disponibilidade
- `deductCredits(userId, amount, examId, description)` → Deduz + registra transação
- `addCredits(userId, amount, type, description)` → Adiciona + registra transação
- **Custo**: 1 crédito = 1 questão gerada por IA

### Geração de PDF (`pdf/generator.ts`)
- `generateExamPdf(data)` → PDF da prova (cabeçalho, dados do aluno, questões)
- `generateAnswerKeyPdf(data)` → PDF do gabarito (grade de respostas + justificativas)

### Autenticação (`utils/auth.ts`)
- Providers: Google OAuth + Credentials (email/senha)
- Adapter: PrismaAdapter
- Estratégia: JWT
- Sessão inclui: id, role, email, name
- Middleware protege rotas `/dashboard/*` e `/admin/*`

---

## Páginas e Funcionalidades

### Públicas
| Rota | Página | Funcionalidade |
|------|--------|----------------|
| `/` | Landing Page | Hero, features, CTA, como funciona |
| `/login` | Login | Google OAuth + email/senha |
| `/register` | Cadastro | Google OAuth + formulário |
| `/redefinir-senha` | Redefinir Senha | Reset por email + nova senha |

### Dashboard (autenticado)
| Rota | Página | Funcionalidade |
|------|--------|----------------|
| `/dashboard` | Dashboard | Visão geral, créditos, exames recentes |
| `/simulados/novo` | Criar Simulado | Formulário com descritores e dificuldades |
| `/simulados/historico` | Histórico | Lista de simulados + download PDF |
| `/simulados/[id]` | Detalhe | Questões, gabarito, status, download |
| `/creditos` | Créditos | Saldo, plano, histórico de transações |
| `/configuracoes` | Configurações | Perfil, escola, cidade, estado, logout |

### Admin (role: admin)
| Rota | Página | Funcionalidade |
|------|--------|----------------|
| `/admin/knowledge-base` | Base de Conhecimento | Upload de materiais, listagem, exclusão |
| `/admin/scraping` | Web Scraping | Extrair conteúdo de URLs + ingestão RAG |

---

## Componentes Principais

### Layout
- **Sidebar.tsx** → Navegação desktop com menu admin condicional
- **MobileNav.tsx** → Menu hamburger + drawer para mobile

### Simulado
- **SimuladoForm.tsx** → Formulário completo de criação (título, professor, escola, avaliação, disciplina, série, questões dinâmicas com descritores)
- **DescriptorSelect.tsx** → Dropdown dinâmico de descritores filtrado por avaliação/disciplina/série

### UI (shadcn/ui)
- button, card, input, label, select, badge, dialog, dropdown-menu, separator, skeleton, form

---

## O que está implementado vs. pendente

### Implementado
- [x] Landing page responsiva
- [x] Autenticação (Google OAuth + credenciais)
- [x] Dashboard com visão geral
- [x] Criação de simulados com formulário completo
- [x] Geração de questões com IA (GPT-4o + RAG)
- [x] Validação de questões (estrutural + semântica)
- [x] Pipeline RAG completo (ingestão, embeddings, busca)
- [x] Extração de texto (PDF, DOCX, TXT)
- [x] Geração de PDF (prova + gabarito)
- [x] Sistema de créditos (saldo, dedução, histórico)
- [x] Histórico de simulados
- [x] Visualização detalhada de simulado
- [x] Perfil e configurações do usuário
- [x] Admin: base de conhecimento RAG
- [x] Admin: web scraping + ingestão
- [x] Middleware de proteção de rotas
- [x] Banco de questões (salvamento automático)
- [x] Seed de dados (avaliações, disciplinas, séries, descritores SPAECE Mat 9º ano, planos)
- [x] Docker Compose (PostgreSQL + Redis)

### Pendente / TODO
- [ ] **Stripe Integration** (`billing/stripe.ts`) → Pagamentos e assinaturas
- [ ] **Plans Verification** (`billing/plans.ts`) → Verificação de limites por plano
- [ ] **Stripe Webhook** (`webhooks/stripe/route.ts`) → Processar eventos de pagamento
- [ ] **Exam Formatter** (`ai/agents/exam-formatter.ts`) → Formatação avançada de layout
- [ ] **QuestionItem.tsx** → Componente de questão com drag-and-drop
- [ ] **ExamPreview.tsx** → Preview do simulado gerado
- [ ] **PdfViewer.tsx** → Visualizador de PDF inline
- [ ] **Descritores adicionais** → Apenas SPAECE Mat 9º ano está seedado
- [ ] **Folha de respostas** → Campo `answerSheetUrl` existe mas não gera
- [ ] **Email (Resend)** → Variáveis de ambiente previstas, não implementado
- [ ] **Monitoramento (Sentry/PostHog)** → Variáveis previstas, não implementado
- [ ] **Redis cache/rate limiting** → Container existe, não integrado no código
- [ ] **Armazenamento S3/R2** → Variáveis previstas para PDFs, não implementado

---

## Scripts Disponíveis

```bash
npm run dev              # Servidor de desenvolvimento
npm run build            # Build de produção
npm run start            # Iniciar produção
npm run lint             # ESLint
npm run db:generate      # Gerar cliente Prisma
npm run db:push          # Push schema para DB
npm run db:migrate       # Criar migração
npm run db:seed          # Executar seed
npm run db:studio        # Prisma Studio (GUI)
npm run docker:up        # Subir containers
npm run docker:down      # Derrubar containers
npm run docker:logs      # Ver logs dos containers
npm run setup:summary    # Resumo da configuração
```

---

## Variáveis de Ambiente Necessárias

```env
# Banco de dados
DATABASE_URL=postgresql://user:pass@localhost:5432/simulaeduca_db
DIRECT_URL=postgresql://user:pass@localhost:5432/simulaeduca_db

# Autenticação
AUTH_SECRET=...
AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# IA
OPENAI_API_KEY=...

# (Opcionais - para funcionalidades futuras)
STRIPE_SECRET_KEY=...
STRIPE_PUBLISHABLE_KEY=...
STRIPE_WEBHOOK_SECRET=...
REDIS_URL=redis://localhost:6379
RESEND_API_KEY=...
SENTRY_DSN=...
```
