/**
 * SimulaEduca — Script CLI de Ingestão de Materiais RAG
 *
 * Uso: npx tsx prisma/seed/rag/ingest-materials.ts
 *
 * Coloque os arquivos em prisma/seed/rag/materials/
 * e configure os metadados em prisma/seed/rag/materials-manifest.json
 *
 * Exemplo de manifest:
 * [
 *   {
 *     "filename": "prova-spaece-mat-9ano-2023.pdf",
 *     "descriptorCode": null,
 *     "subjectSlug": "matematica",
 *     "gradeLevelSlug": "9_ano",
 *     "evaluationSlug": "spaece",
 *     "difficulty": "medio"
 *   }
 * ]
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { ingestMaterial } from "../../../src/lib/ai/rag/ingest";
import { extractFromPdf, extractFromDocx, extractFromTxt, detectMimeType } from "../../../src/lib/ai/rag/extractors";

interface ManifestEntry {
  filename: string;
  descriptorCode?: string;
  subjectSlug?: string;
  gradeLevelSlug?: string;
  evaluationSlug?: string;
  difficulty?: string;
}

// ID do usuário admin que será creditado como "uploadedBy"
// Altere para um UUID de admin real do seu banco
const ADMIN_USER_ID = process.env.SEED_ADMIN_USER_ID ?? "";

async function main() {
  if (!ADMIN_USER_ID) {
    console.error("❌ Defina SEED_ADMIN_USER_ID no .env com o UUID de um usuário admin.");
    process.exit(1);
  }

  const materialsDir = path.join(__dirname, "materials");
  const manifestPath = path.join(__dirname, "materials-manifest.json");

  if (!fs.existsSync(materialsDir)) {
    fs.mkdirSync(materialsDir, { recursive: true });
    console.log(`📁 Pasta criada: ${materialsDir}`);
    console.log("Coloque os arquivos PDF/DOCX/TXT nessa pasta e crie o materials-manifest.json");
    return;
  }

  if (!fs.existsSync(manifestPath)) {
    const exampleManifest: ManifestEntry[] = [
      {
        filename: "exemplo.pdf",
        subjectSlug: "matematica",
        gradeLevelSlug: "9_ano",
        evaluationSlug: "spaece",
        difficulty: "medio",
      },
    ];
    fs.writeFileSync(manifestPath, JSON.stringify(exampleManifest, null, 2));
    console.log(`📝 Manifest de exemplo criado: ${manifestPath}`);
    console.log("Configure os metadados e execute novamente.");
    return;
  }

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`\n🔄 Iniciando ingestão de ${manifest.length} arquivo(s)...\n`);

  let totalChunks = 0;
  for (const entry of manifest) {
    const filePath = path.join(materialsDir, entry.filename);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Arquivo não encontrado: ${entry.filename} — pulando`);
      continue;
    }

    console.log(`📄 Processando: ${entry.filename}`);
    const buffer = fs.readFileSync(filePath);
    const sourceType = detectMimeType(entry.filename);

    let content = "";
    try {
      if (sourceType === "pdf") {
        content = await extractFromPdf(buffer);
      } else if (sourceType === "docx") {
        content = await extractFromDocx(buffer);
      } else {
        content = await extractFromTxt(buffer);
      }
    } catch (err) {
      console.error(`  ❌ Erro ao extrair texto: ${err}`);
      continue;
    }

    if (!content.trim()) {
      console.warn(`  ⚠️  Conteúdo vazio — pulando`);
      continue;
    }

    try {
      const result = await ingestMaterial({
        content,
        sourceType: sourceType === "txt" ? "txt" : sourceType,
        sourceFileName: entry.filename,
        metadata: {
          descriptorCode: entry.descriptorCode,
          subjectSlug: entry.subjectSlug,
          gradeLevelSlug: entry.gradeLevelSlug,
          evaluationSlug: entry.evaluationSlug,
          difficulty: entry.difficulty,
        },
        uploadedBy: ADMIN_USER_ID,
      });

      console.log(`  ✅ ${result.chunksCreated} chunks criados`);
      totalChunks += result.chunksCreated;
    } catch (err) {
      console.error(`  ❌ Erro ao ingerir: ${err}`);
    }
  }

  console.log(`\n✅ Ingestão concluída: ${totalChunks} chunks totais criados no pgvector.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
