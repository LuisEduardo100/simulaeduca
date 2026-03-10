# Prompt: Admin Dashboard — Visão Total do Sistema

## 🎯 Objetivo
Você é um engenheiro de software sênior e arquiteto de sistemas. Sua missão é **investigar profundamente**, projetar e implementar uma **página de administração completa** para um sistema que gerencia provas vetorizadas e não vetorizadas, agentes de IA, base de conhecimento e scraping web.

O admin precisa sair do estado de "gestão às cegas" e ter **controle total, visibilidade granular e capacidade de tomada de decisão** sobre todos os aspectos do sistema.

---

## 🔍 Fase 1 — Investigação Profunda (OBRIGATÓRIA antes de implementar)

Antes de escrever qualquer linha de código, execute as seguintes investigações:

### 1.1 Investigação Interna (Codebase)
- Mapeie **todas as rotas existentes** da aplicação (API routes + page routes)
- Identifique **todos os agentes criados**: nome, função, modelo LLM usado, ferramentas disponíveis, fluxo de execução
- Mapeie o **pipeline de geração de questões**: como são geradas hoje, quais etapas, quais agentes participam, em que ordem
- Identifique como as **provas vetorizadas** são armazenadas, indexadas e consultadas (qual vector store: Pinecone, Supabase pgvector, Chroma, Weaviate etc.)
- Identifique como as **provas não vetorizadas** são armazenadas e gerenciadas
- Mapeie o **fluxo de scraping web**: quais fontes, frequência, volume, status de saúde
- Identifique todos os **schemas de banco de dados** relevantes (tabelas/collections de provas, embeddings, agentes, logs)
- Liste todas as **variáveis de ambiente** e serviços externos conectados

### 1.2 Investigação Externa (Melhores Práticas de Mercado)
Pesquise e aplique os seguintes benchmarks:

**Admin Dashboards de referência para sistemas RAG/AI:**
- Como Langchain, LlamaIndex e outros frameworks expõem observabilidade de agentes
- Padrões de LLMOps (LangSmith, LangFuse, Helicone, Phoenix/Arize) para monitoramento de pipelines de IA
- Padrões de Admin UIs em produtos como Supabase, Pinecone Console, OpenAI Playground
- Referências de Data Observability (Great Expectations, Monte Carlo) para qualidade de dados

**Métricas essenciais de sistemas RAG que todo admin deve ver:**
- Retrieval precision/recall
- Chunk quality score
- Embedding coverage
- Query latency (P50, P95, P99)
- Answer relevance score
- Hallucination rate

**Padrões de gestão de arquivos em sistemas de produção:**
- Versionamento de documentos
- Status lifecycle (pending → processing → vectorized → active → deprecated)
- Auditoria e rastreabilidade de mudanças

---

## 🏗️ Fase 2 — O Que Implementar

Implemente uma **rota protegida `/admin`** com as seguintes seções. Use tabs ou sidebar de navegação.

---

### 📊 Seção 1: Dashboard Geral (Home do Admin)

**Cards de métricas em tempo real:**
- Total de provas no sistema (vetorizadas vs não vetorizadas)
- Total de questões geradas (hoje / semana / mês)
- Agentes ativos vs inativos
- Status do scraping web (última execução, próxima, sucesso/falha)
- Saúde geral do site (score visual: 🟢 / 🟡 / 🔴)
- Uso de tokens LLM (total gasto, custo estimado)
- Latência média de geração de questões

**Gráficos:**
- Timeline de questões geradas por dia (últimos 30 dias)
- Distribuição de provas por status (pizza/donut chart)
- Volume de scraping por fonte ao longo do tempo

---

### 📁 Seção 2: Gestão de Provas

**Sub-seção 2A — Provas Vetorizadas:**
- Tabela com: ID, nome, fonte, data de vetorização, modelo de embedding usado, número de chunks, status, ações
- Filtros: por status, por data, por fonte, por modelo
- Ações por arquivo: re-vetorizar, visualizar chunks, deletar, ver metadados completos
- Visualizador de chunks: mostrar os N primeiros chunks de uma prova com score de qualidade por chunk
- Indicador de cobertura do embedding (% de conteúdo efetivamente indexado)

**Sub-seção 2B — Provas Não Vetorizadas:**
- Tabela com: ID, nome, tipo (PDF/texto/URL), data de upload, tamanho, status de processamento
- Ações: iniciar vetorização, download, deletar, pré-visualizar
- Fila de processamento pendente com estimativa de tempo

**Sub-seção 2C — Upload e Ingestão:**
- Interface de upload com drag-and-drop
- Configuração de chunking (tamanho do chunk, overlap)
- Seleção de modelo de embedding
- Preview antes de confirmar vetorização

---

### 🤖 Seção 3: Painel de Agentes

Para **cada agente registrado no sistema**, exibir um card detalhado contendo:

```
┌─────────────────────────────────────────┐
│ 🤖 Nome do Agente                        │
│ Função: [descrição clara do papel]       │
│ Modelo: GPT-4o / Claude 3.5 / etc.       │
│ Status: 🟢 Ativo                         │
│                                          │
│ Ferramentas disponíveis:                 │
│   • [tool_1]: descrição                  │
│   • [tool_2]: descrição                  │
│                                          │
│ Pipeline: Etapa X de Y                   │
│ Última execução: há 5 minutos            │
│ Execuções hoje: 42 | Taxa de sucesso: 97%│
│                                          │
│ [Ver Logs] [Configurar] [Desativar]      │
└─────────────────────────────────────────┘
```

**Painel global de agentes:**
- Mapa visual do fluxo entre agentes (grafo de dependência)
- Histórico de execuções com input/output expandível
- Alertas de falhas e retries

---

### ❓ Seção 4: Pipeline de Geração de Questões

**Visão do fluxo atual:**
- Diagrama step-by-step de como uma questão é gerada (do input ao output)
- Status de cada etapa: quantas questões em cada fase agora

**Configuração e controle:**
- Parâmetros de geração por tipo de questão (múltipla escolha, dissertativa, verdadeiro/falso)
- Prompt base usado por cada agente gerador (editável pelo admin)
- Temperatura, max_tokens e outros hiperparâmetros por agente
- Regras de validação de qualidade (habilitar/desabilitar filtros)

**Histórico e rastreabilidade:**
- Log de questões geradas com: agente usado, prova de origem, tempo de geração, tokens consumidos, score de qualidade
- Capacidade de re-gerar uma questão específica
- Comparação de versões de questões

---

### 🌐 Seção 5: Scraping Web

- Lista de todas as fontes configuradas (URL, frequência, último status)
- Logs da última execução por fonte
- Conteúdo coletado recentemente com preview
- Controles: executar agora, pausar fonte, adicionar nova fonte, ajustar frequência
- Métricas: páginas coletadas, conteúdo novo vs duplicado, erros por fonte

---

### 🏥 Seção 6: Saúde do Sistema

**Monitoramento de infraestrutura:**
- Status de conexão com todos os serviços externos (banco de dados, vector store, LLM API, storage)
- Latência de cada serviço (medida a cada 60s)
- Uso de armazenamento (banco + vector store + arquivos)
- Erros recentes agrupados por tipo (últimas 24h)

**Alertas configuráveis:**
- Thresholds para alertas (ex: latência > 3s, taxa de erro > 5%)
- Histórico de incidentes

---

### 📋 Seção 7: Logs e Auditoria

- Log de todas as ações do admin (quem fez o quê e quando)
- Log de erros do sistema com stack trace expansível
- Filtros: por nível (info/warn/error), por serviço, por período
- Exportação de logs em CSV/JSON

---

## ⚙️ Fase 3 — Requisitos Técnicos de Implementação

### API Endpoints a criar (se não existirem):
```
GET  /api/admin/stats           → métricas gerais do dashboard
GET  /api/admin/provas          → listagem paginada de provas
GET  /api/admin/provas/:id/chunks → chunks de uma prova vetorizada
POST /api/admin/provas/:id/revectorize → re-vetorizar
GET  /api/admin/agentes         → todos os agentes com status
GET  /api/admin/agentes/:id/logs → logs de execução de um agente
GET  /api/admin/questoes        → histórico de questões geradas
GET  /api/admin/scraping        → status e logs de scraping
GET  /api/admin/health          → health check de todos os serviços
GET  /api/admin/logs            → logs do sistema
```

### Segurança:
- Middleware de autenticação: verificar se usuário é `role: admin` antes de qualquer rota `/admin`
- Rate limiting nas rotas de admin
- Logs de acesso ao painel admin

### Performance:
- Usar **SWR ou React Query** para polling de métricas em tempo real (intervalo: 30s)
- Paginação server-side para tabelas com muitos registros
- Skeleton loading em todos os componentes
- Dados pesados (logs, chunks) carregados sob demanda (lazy load)

### Stack de UI sugerida (adapte ao projeto):
- Componentes de tabela: TanStack Table
- Gráficos: Recharts ou Chart.js
- Grafo de agentes: React Flow
- Notificações: Sonner ou React Hot Toast
- Ícones de status: badges coloridos (verde/amarelo/vermelho)

---

## 📦 Entregáveis Esperados

1. **Página `/admin`** com todas as 7 seções implementadas
2. **API routes** necessárias para alimentar os dados
3. **Componentes reutilizáveis** para métricas, tabelas e status
4. **Middleware de proteção** da rota admin
5. **Documentação inline** explicando cada seção e decisão de design

---

## ✅ Critérios de Qualidade

- [ ] O admin consegue ver **todas as provas** com status claro (vetorizada ou não)
- [ ] O admin consegue entender **o que cada agente faz** sem precisar ler o código
- [ ] O admin consegue ver **como cada questão foi gerada** e por qual agente
- [ ] O admin consegue identificar **falhas e gargalos** do sistema em menos de 30 segundos
- [ ] O admin consegue **tomar ações corretivas** (re-vetorizar, re-gerar, pausar agente) diretamente pela UI
- [ ] Todas as métricas têm **contexto suficiente** para decisão (não apenas número, mas tendência)
- [ ] A interface é **responsiva e rápida** mesmo com grandes volumes de dados

---

## 🚫 O Que NÃO Fazer

- Não criar uma página estática com dados mockados sem conexão real
- Não misturar lógica de admin com rotas públicas do site
- Não exibir métricas sem indicar o período de referência
- Não criar uma única tela gigante sem navegação entre seções
- Não ignorar estados de loading, erro e vazio em nenhum componente

---

*Prompt gerado para execução agêntica. Siga a Fase 1 (investigação) antes de qualquer implementação.*
