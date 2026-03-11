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

  // 3. Inserir em batches de 50 (reduz N round-trips para N/50)
  const BATCH_SIZE = 50;
  let chunksCreated = 0;

  for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
    const batchChunks = chunks.slice(batchStart, batchEnd);
    const batchEmbeddings = embeddings.slice(batchStart, batchEnd);

    // Construir multi-VALUES SQL para batch insert
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (let i = 0; i < batchChunks.length; i++) {
      const globalIdx = batchStart + i;
      const vectorStr = `[${batchEmbeddings[i].join(",")}]`;

      valuePlaceholders.push(
        `(gen_random_uuid(), $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}::uuid, $${paramIdx + 11}::vector, NOW())`
      );
      params.push(
        batchChunks[i],
        sourceType,
        sourceFileName ?? null,
        metadata.descriptorCode ?? null,
        metadata.subjectSlug ?? null,
        metadata.gradeLevelSlug ?? null,
        metadata.evaluationSlug ?? null,
        metadata.difficulty ?? null,
        globalIdx,
        chunks.length,
        uploadedBy,
        vectorStr
      );
      paramIdx += 12;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO material_chunks (
        id, content, source_type, source_file_name,
        descriptor_code, subject_slug, grade_level_slug, evaluation_slug,
        difficulty, chunk_index, total_chunks, uploaded_by, embedding, created_at
      ) VALUES ${valuePlaceholders.join(", ")}`,
      ...params
    );
    chunksCreated += batchChunks.length;
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
  hasImage?: boolean;
  imageDescription?: string;
  imageUrl?: string;
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

// ─── Ingerir questões extraídas também no question_bank ──────────────────────

export interface IngestToQuestionBankResult {
  inserted: number;
  duplicates: number;
  failed: number;
}

export async function ingestExtractedToQuestionBank(
  questions: QuestionToIngest[],
  sourceFileName?: string
): Promise<IngestToQuestionBankResult> {
  let inserted = 0;
  let duplicates = 0;
  let failed = 0;

  for (const q of questions) {
    try {
      if (!q.descriptorCode || !q.correctAnswer) {
        failed++;
        continue;
      }

      // Resolver descriptorId a partir do descriptorCode + metadata
      const descriptor = await prisma.descriptor.findFirst({
        where: {
          code: q.descriptorCode,
          ...(q.evaluationSlug ? { evaluation: { slug: q.evaluationSlug } } : {}),
          ...(q.subjectSlug ? { subject: { slug: q.subjectSlug } } : {}),
          ...(q.gradeLevelSlug ? { gradeLevel: { slug: q.gradeLevelSlug } } : {}),
        },
      });

      if (!descriptor) {
        // Tentar sem filtros de metadata
        const fallback = await prisma.descriptor.findFirst({
          where: { code: q.descriptorCode },
        });
        if (!fallback) {
          failed++;
          continue;
        }
        // Use fallback descriptor (dedup semântico aqui também)
        const content = `${q.stem}\nA) ${q.optionA}\nB) ${q.optionB}\nC) ${q.optionC}\nD) ${q.optionD}`;
        const [embedding] = await generateEmbeddings([content]);
        const vectorStr = `[${embedding.join(",")}]`;

        const similar = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM question_bank
           WHERE descriptor_id = $1
             AND 1 - (embedding <=> $2::vector) >= 0.92
           LIMIT 1`,
          fallback.id,
          vectorStr
        );

        if (similar.length > 0) {
          duplicates++;
          continue;
        }

        await insertToQuestionBankWithEmbedding(q, fallback.id, vectorStr, sourceFileName);
        inserted++;
        continue;
      }

      // Dedup semântico: gerar embedding e verificar se já existe questão similar (>= 0.92)
      const content = `${q.stem}\nA) ${q.optionA}\nB) ${q.optionB}\nC) ${q.optionC}\nD) ${q.optionD}`;
      const [embedding] = await generateEmbeddings([content]);
      const vectorStr = `[${embedding.join(",")}]`;

      const similar = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM question_bank
         WHERE descriptor_id = $1
           AND 1 - (embedding <=> $2::vector) >= 0.92
         LIMIT 1`,
        descriptor.id,
        vectorStr
      );

      if (similar.length > 0) {
        duplicates++;
        continue;
      }

      await insertToQuestionBankWithEmbedding(q, descriptor.id, vectorStr, sourceFileName);
      inserted++;
    } catch (err) {
      console.error("[ingestExtractedToQuestionBank] Erro:", err);
      failed++;
    }
  }

  return { inserted, duplicates, failed };
}

// Versão que recebe embedding pré-calculado (evita gerar 2x quando dedup já calculou)
async function insertToQuestionBankWithEmbedding(
  q: QuestionToIngest,
  descriptorId: number,
  vectorStr: string,
  sourceFileName?: string
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO question_bank (
      id, descriptor_id, stem, option_a, option_b, option_c, option_d,
      correct_answer, justification, difficulty, quality_score, times_used,
      flagged, origin, validated, has_image, image_description, image_url,
      subject_slug, grade_level_slug, evaluation_slug, source_file_name,
      embedding, created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NULL, $8,
      CASE WHEN $7 IS NOT NULL AND $7 != '' THEN 0.75 ELSE 0.60 END,
      0, false, 'extracted',
      CASE WHEN $7 IS NOT NULL AND $7 != '' THEN true ELSE false END,
      $9, $10, $11,
      $12, $13, $14, $15,
      $16::vector, NOW()
    )`,
    descriptorId,
    q.stem,
    q.optionA,
    q.optionB,
    q.optionC,
    q.optionD,
    q.correctAnswer!,
    q.difficulty || null,
    q.hasImage ?? false,
    q.imageDescription || null,
    q.imageUrl || null,
    q.subjectSlug || null,
    q.gradeLevelSlug || null,
    q.evaluationSlug || null,
    sourceFileName || null,
    vectorStr
  );
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
