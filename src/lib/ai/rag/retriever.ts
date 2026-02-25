import { prisma } from "@/lib/db/prisma";
import { generateEmbedding } from "./embeddings";

export interface RetrievalOptions {
  descriptorCode: string;
  subjectSlug: string;
  gradeLevelSlug: string;
  evaluationSlug?: string;
  topK?: number;
}

export interface RetrievedChunk {
  content: string;
  sourceType: string;
  descriptorCode: string | null;
  similarity: number;
}

interface RawChunkRow {
  content: string;
  source_type: string;
  descriptor_code: string | null;
  similarity: number;
}

export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions
): Promise<RetrievedChunk[]> {
  const { descriptorCode, subjectSlug, gradeLevelSlug, topK = 5 } = options;

  // Gerar embedding da query
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // Busca por similaridade cosseno com filtros por metadados
  // Prioriza chunks do mesmo descritor, depois da mesma disciplina/série
  const rows = await prisma.$queryRaw<RawChunkRow[]>`
    SELECT
      content,
      source_type,
      descriptor_code,
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM material_chunks
    WHERE
      embedding IS NOT NULL
      AND (
        descriptor_code = ${descriptorCode}
        OR (subject_slug = ${subjectSlug} AND grade_level_slug = ${gradeLevelSlug})
      )
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${topK}
  `;

  return rows.map((row) => ({
    content: row.content,
    sourceType: row.source_type,
    descriptorCode: row.descriptor_code,
    similarity: Number(row.similarity),
  }));
}
