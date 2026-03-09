import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { prisma } from "@/lib/db/prisma";
import { generateEmbeddings } from "./embeddings";

export interface IngestMetadata {
  descriptorCode?: string;
  subjectSlug?: string;
  gradeLevelSlug?: string;
  evaluationSlug?: string;
  difficulty?: string;
}

export interface IngestOptions {
  content: string;
  sourceType: "pdf" | "docx" | "txt" | "text";
  sourceFileName?: string;
  metadata: IngestMetadata;
  uploadedBy: string; // userId do admin
}

export interface IngestResult {
  chunksCreated: number;
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 100,
  separators: ["\n\n", "\n", ". ", "! ", "? ", " ", ""],
});

export async function ingestMaterial(options: IngestOptions): Promise<IngestResult> {
  const { content, sourceType, sourceFileName, metadata, uploadedBy } = options;

  // 1. Dividir o texto em chunks
  const chunks = await splitter.splitText(content);

  if (chunks.length === 0) {
    return { chunksCreated: 0 };
  }

  // 2. Gerar embeddings para todos os chunks de uma vez (batch)
  const embeddings = await generateEmbeddings(chunks);

  // 3. Inserir cada chunk no banco com seu embedding
  let chunksCreated = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const embedding = embeddings[i];

    // Formatar o vetor como string para o cast ::vector do pgvector
    const vectorStr = `[${embedding.join(",")}]`;

    await prisma.$executeRaw`
      INSERT INTO material_chunks (
        id,
        content,
        source_type,
        source_file_name,
        descriptor_code,
        subject_slug,
        grade_level_slug,
        evaluation_slug,
        difficulty,
        chunk_index,
        total_chunks,
        uploaded_by,
        embedding,
        created_at
      ) VALUES (
        gen_random_uuid(),
        ${chunkText},
        ${sourceType},
        ${sourceFileName ?? null},
        ${metadata.descriptorCode ?? null},
        ${metadata.subjectSlug ?? null},
        ${metadata.gradeLevelSlug ?? null},
        ${metadata.evaluationSlug ?? null},
        ${metadata.difficulty ?? null},
        ${i},
        ${chunks.length},
        ${uploadedBy}::uuid,
        ${vectorStr}::vector,
        NOW()
      )
    `;
    chunksCreated++;
  }

  return { chunksCreated };
}

// ─── Ingestão de questões estruturadas (uma por chunk, com metadata próprio) ──

export interface QuestionToIngest {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer?: string;
  descriptorCode?: string;
  difficulty?: string;
  subjectSlug?: string;
  gradeLevelSlug?: string;
  evaluationSlug?: string;
}

export interface IngestQuestionsResult {
  inserted: number;
  failed: number;
}

export async function ingestQuestions(
  questions: QuestionToIngest[],
  uploadedBy: string,
  sourceFileName?: string
): Promise<IngestQuestionsResult> {
  let inserted = 0;
  let failed = 0;

  for (const q of questions) {
    try {
      const diffLabel =
        q.difficulty === "facil"
          ? "Fácil"
          : q.difficulty === "dificil"
            ? "Difícil"
            : q.difficulty === "medio"
              ? "Médio"
              : null;

      const headerParts = [
        q.descriptorCode ? `Descritor: ${q.descriptorCode}` : null,
        diffLabel ? `Dificuldade: ${diffLabel}` : null,
      ].filter(Boolean);

      const content = [
        headerParts.length > 0 ? `[${headerParts.join(" | ")}]` : null,
        "",
        q.stem,
        "",
        `A) ${q.optionA}`,
        `B) ${q.optionB}`,
        `C) ${q.optionC}`,
        `D) ${q.optionD}`,
        q.correctAnswer ? `\nGabarito: ${q.correctAnswer}` : null,
      ]
        .filter((l) => l !== null)
        .join("\n")
        .trim();

      const [embedding] = await generateEmbeddings([content]);
      const vectorStr = `[${embedding.join(",")}]`;

      await prisma.$executeRaw`
        INSERT INTO material_chunks (
          id, content, source_type, source_file_name,
          descriptor_code, subject_slug, grade_level_slug, evaluation_slug,
          difficulty, chunk_index, total_chunks, uploaded_by, embedding, created_at
        ) VALUES (
          gen_random_uuid(),
          ${content},
          'text',
          ${sourceFileName ?? null},
          ${q.descriptorCode || null},
          ${q.subjectSlug || null},
          ${q.gradeLevelSlug || null},
          ${q.evaluationSlug || null},
          ${q.difficulty || null},
          0, 1,
          ${uploadedBy}::uuid,
          ${vectorStr}::vector,
          NOW()
        )
      `;
      inserted++;
    } catch (err) {
      console.error("[ingestQuestions] Falha ao ingerir questão:", err);
      failed++;
    }
  }

  return { inserted, failed };
}

export async function deleteMaterialBySource(sourceFileName: string): Promise<number> {
  const result = await prisma.materialChunk.deleteMany({
    where: { sourceFileName },
  });
  return result.count;
}

export interface MaterialSummary {
  sourceFileName: string | null;
  sourceType: string;
  chunkCount: number;
  createdAt: Date;
}

export async function listMaterials(): Promise<MaterialSummary[]> {
  const rows = await prisma.$queryRaw<MaterialSummary[]>`
    SELECT
      source_file_name AS "sourceFileName",
      source_type AS "sourceType",
      COUNT(*)::int AS "chunkCount",
      MIN(created_at) AS "createdAt"
    FROM material_chunks
    GROUP BY source_file_name, source_type
    ORDER BY MIN(created_at) DESC
  `;
  return rows;
}
