/**
 * SimulaEduca — Script de Resumo do Setup
 *
 * Lista todos os arquivos criados e exibe os próximos passos.
 * Uso: npm run setup:summary
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

function walkDir(dir: string, prefix = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];

  // Ignorar node_modules, .git, .next, generated
  const ignored = new Set([
    "node_modules",
    ".git",
    ".next",
    "generated",
    ".cache",
  ]);

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT, fullPath);

    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, prefix));
    } else {
      results.push(relPath);
    }
  }

  return results;
}

function countDirs(dir: string): number {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const ignored = new Set(["node_modules", ".git", ".next", "generated"]);
  let count = 0;

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    if (entry.isDirectory()) {
      count += 1 + countDirs(path.join(dir, entry.name));
    }
  }

  return count;
}

const files = walkDir(ROOT);
const dirCount = countDirs(ROOT);

const LINE = "═".repeat(50);

console.log(`\n╔${LINE}╗`);
console.log(`║       SimulaEduca — Setup Summary                ║`);
console.log(`╚${LINE}╝\n`);

console.log(`✅ Arquivos criados: ${files.length}`);
console.log(`📁 Pastas criadas:   ${dirCount}`);

console.log("\n🔹 Arquivos principais:");
const highlight = [
  "prisma/schema.prisma",
  "docker-compose.yml",
  "docker/init.sql",
  ".env.example",
  ".env",
  "src/lib/db/prisma.ts",
  "src/lib/utils/auth.ts",
  "src/app/api/auth/[...nextauth]/route.ts",
  "prisma/seed/seed.ts",
  "prisma/seed/data/descriptors-spaece-mat-9ano.json",
  "prisma/seed/data/plans.json",
];

for (const f of highlight) {
  const exists = fs.existsSync(path.join(ROOT, f));
  console.log(`   ${exists ? "✅" : "❌"} ${f}`);
}

console.log("\n" + "─".repeat(52));
console.log("📋 PRÓXIMOS PASSOS — Roteiro de Implementação");
console.log("─".repeat(52));

console.log(`
🐳 AGORA — Inicializar o banco local:
   1. npm run docker:up
      (sobe PostgreSQL 16 + pgvector + Redis)

   2. npx prisma generate
      (gera o Prisma Client com os modelos)

   3. npx prisma db push
      (aplica o schema no banco Docker)

   4. npm run db:seed
      (popula: avaliações, disciplinas, séries,
       25 descritores SPAECE Mat 9º ano, 4 planos)

   5. npm run dev
      (Next.js em localhost:3000)

📅 SEMANA 3 — Pipeline RAG:
   ✦ Baixar PDFs das matrizes SPAECE/SAEB (INEP)
   ✦ Baixar simulados do blog Prof. Warles
   ✦ Configurar Pinecone index (dimension=1536, metric=cosine)
     OU usar pgvector local (já configurado no Docker)
   ✦ Implementar prisma/seed/rag/ingest-materials.ts
   ✦ Indexar materiais com text-embedding-3-small

📅 SEMANA 4 — Agentes de IA:
   ✦ src/lib/ai/agents/question-generator.ts
     → LangChain.js + GPT-4o
   ✦ src/lib/ai/rag/retriever.ts
     → busca semântica por descritor + série
   ✦ src/lib/ai/rag/prompts.ts
     → templates de prompt (ver Seção 5.1 do plano)
   ✦ src/lib/ai/agents/question-validator.ts
     → validação de corretude e formato

📅 SEMANA 5 — Interface do Usuário:
   ✦ src/components/simulado/SimuladoForm.tsx
   ✦ src/components/simulado/DescriptorSelect.tsx
   ✦ src/app/(dashboard)/simulados/novo/page.tsx
   ✦ src/app/api/simulados/gerar/route.ts
   ✦ Autenticação: Google OAuth (configurar no Google Cloud)

📅 SEMANA 6 — PDF e Deploy:
   ✦ src/lib/pdf/generator.ts (Puppeteer server-side)
   ✦ src/lib/pdf/templates/ (HTML templates da prova)
   ✦ src/app/api/simulados/pdf/route.ts
   ✦ Deploy na Vercel (npm run build, vercel deploy)
   ✦ Configurar variáveis de ambiente na Vercel
   ✦ Teste beta com 5-10 professores reais
`);

console.log("─".repeat(52));
console.log("💡 Dica: Copie .env.example para .env.local e");
console.log("   configure suas chaves de API antes de rodar.");
console.log("─".repeat(52) + "\n");
