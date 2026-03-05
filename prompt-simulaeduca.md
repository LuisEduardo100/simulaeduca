# Prompt para Claude Code — Refatoração da Tela "Criar Novo Simulado"

## Contexto do Projeto

Leia o arquivo `GUIA_PROJETO.md` na raiz do projeto para entender a arquitetura completa (Next.js 16, Prisma 7, PostgreSQL + pgvector, OpenAI GPT-4o, shadcn/ui). O foco desta tarefa é a página `/simulados/novo` e a rota de geração `/api/simulados/gerar`.

## Objetivo

Refatorar a experiência de criação de simulado para que o professor consiga gerar uma prova de 26 questões com o mínimo de cliques, máxima personalização e resiliência a falhas.

---

## Funcionalidades a Implementar

### 1. Sistema de Cabeçalho da Prova (3 modos mutuamente exclusivos)

Adicione um componente `HeaderSelector` com radio buttons para escolher entre:

- **Cabeçalho padrão**: usa o template institucional já existente no sistema (logo + nome da escola + campos de aluno).
- **Cabeçalho personalizado**: permite upload de imagem (PNG/JPG, max 2MB) do computador do professor que será usada como cabeçalho no PDF gerado. Exibir preview da imagem após upload.
- **Sem cabeçalho**: gera a prova sem nenhum cabeçalho, área em branco no topo.

Para os modos "padrão" e "personalizado", exibir campos opcionais para o professor preencher dados que já virão impressos na prova: **Nome do Professor**, **Escola**, **Disciplina**, **Turma**, **Data da Avaliação**. Esses campos devem ser pré-preenchidos com os dados do perfil do usuário (session) quando disponíveis.

**Arquivos a modificar/criar:**
- `src/components/simulado/HeaderSelector.tsx` (novo)
- `src/components/simulado/SimuladoForm.tsx` (integrar o HeaderSelector)
- `src/lib/pdf/generator.ts` (renderizar os 3 modos de cabeçalho)
- `src/app/api/simulados/gerar/route.ts` (receber e persistir config de cabeçalho)
- Adicionar campo `headerConfig` (Json?) na tabela `exams` do Prisma schema para persistir a escolha

### 2. Seleção de Descritores com Distribuição Automática de Questões

Substituir a lógica atual (1 questão → 1 descritor → 1 dificuldade) por um novo fluxo:

1. O professor seleciona a **avaliação**, **disciplina** e **série** (como já funciona).
2. O sistema carrega todos os descritores disponíveis para aquele filtro.
3. O professor marca **apenas os descritores** que deseja (checkboxes com "Selecionar Todos" / "Limpar Todos").
4. O total de questões é fixo em **26**. O sistema distribui automaticamente as 26 questões entre os descritores selecionados de forma equilibrada:
   - Se 1 descritor selecionado → 26 questões desse descritor.
   - Se 26 descritores → 1 questão por descritor.
   - Se 5 descritores → ~5 questões por descritor (distribuição round-robin para lidar com resto).
5. Exibir um **resumo visual** mostrando a distribuição antes de gerar (ex: "D07: 6 questões, D12: 5 questões, D15: 5 questões...").
6. O professor pode opcionalmente **ajustar manualmente** a quantidade por descritor (com validação para que o total sempre some 26).
7. Campo de **dificuldade geral** da prova: Fácil / Médio / Difícil / Misto — aplicado globalmente (no modo "Misto", a dificuldade é randomizada por questão).

**Arquivos a modificar/criar:**
- `src/components/simulado/DescriptorSelect.tsx` (refatorar para multi-select com checkboxes)
- `src/components/simulado/QuestionDistribution.tsx` (novo — resumo visual + ajuste manual)
- `src/components/simulado/SimuladoForm.tsx` (integrar novo fluxo)
- `src/app/api/simulados/gerar/route.ts` (receber array de descritores + distribuição)

### 3. Geração Progressiva com Persistência e Recuperação

Implementar um sistema resiliente que não perca progresso em caso de erro:

**Backend (`/api/simulados/gerar`):**
- Alterar de geração em lote para **geração questão por questão** (loop sequencial).
- Após cada questão gerada e validada com sucesso, **persistir imediatamente** no banco (tabela `exam_questions`) e **deduzir 1 crédito**.
- Atualizar o campo `exams.totalQuestions` incrementalmente.
- Se ocorrer erro em qualquer questão: capturar o erro, marcar o exam com `status: "partial"` (adicionar este status ao enum), salvar o número da última questão gerada com sucesso, e retornar resposta com o progresso parcial.
- Criar endpoint `GET /api/simulados/[id]/progresso` que retorna o estado atual da geração (questões geradas, total esperado, status).

**Frontend (tela de geração):**
- Criar componente `GenerationProgress.tsx` com:
  - Barra de progresso animada (ex: "Gerando questão 7 de 26...").
  - Lista das questões já geradas aparecendo em tempo real (usar polling a cada 3s no endpoint de progresso, ou Server-Sent Events se preferir).
  - Indicador visual por questão: ✅ gerada, ⏳ gerando, ❌ erro.
  - Ao finalizar com sucesso: botão "Ver Simulado" e "Baixar PDF".
  - Ao ocorrer erro parcial: exibir mensagem clara ("15 de 26 questões geradas. Deseja continuar de onde parou?") com botão **"Retomar Geração"** que chama novamente `/api/simulados/gerar` passando o `examId` existente para continuar a partir da última questão.

**Arquivos a modificar/criar:**
- `src/components/simulado/GenerationProgress.tsx` (novo)
- `src/app/api/simulados/gerar/route.ts` (refatorar para geração incremental)
- `src/app/api/simulados/[id]/progresso/route.ts` (novo endpoint)
- `src/app/(dashboard)/simulados/[id]/page.tsx` (exibir opção de retomar se status "partial")
- Prisma schema: adicionar `"partial"` como status válido do exam

---

## Restrições e Diretrizes Técnicas

- **Não quebre funcionalidades existentes.** Toda alteração deve ser backward-compatible.
- Use **shadcn/ui** para todos os componentes de UI (checkbox, radio-group, progress, badge, etc.).
- Mantenha o padrão de **Server Components** onde possível; use `"use client"` apenas onde necessário (formulários, estado interativo).
- Valide inputs tanto no **frontend** (UX) quanto no **backend** (segurança).
- Mantenha tipagem forte — atualize `src/types/index.ts` com os novos tipos.
- Siga o padrão de erro existente nas rotas API (try/catch + NextResponse com status codes adequados).
- O custo de créditos permanece: **1 crédito = 1 questão**.
- Gere a migration do Prisma para os novos campos.

## Ordem de Implementação Sugerida

1. **Schema Prisma** → adicionar campos `headerConfig` (Json?) em `exams` e status `"partial"`.
2. **Backend da geração** → refatorar `/api/simulados/gerar` para geração incremental + criar endpoint de progresso.
3. **DescriptorSelect** → refatorar para multi-select com distribuição automática.
4. **QuestionDistribution** → componente de resumo e ajuste manual.
5. **HeaderSelector** → componente de seleção de cabeçalho.
6. **SimuladoForm** → integrar todos os novos componentes.
7. **GenerationProgress** → tela de progresso com recuperação.
8. **PDF Generator** → suportar os 3 modos de cabeçalho.
9. **Testes manuais** → fluxo completo de criação, erro parcial e retomada.
