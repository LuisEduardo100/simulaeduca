/**
 * SimulaEduca — Script de Ingestão de Materiais RAG
 *
 * TODO (Semana 3): Implementar pipeline de ingestão
 *
 * Fontes a ingerir:
 * - Matrizes de Referência SPAECE (PDF)
 * - Matrizes de Referência SAEB/INEP (PDF)
 * - Provas anteriores SPAECE/SAEB (PDF)
 * - Materiais do Prof. Warles (HTML/PDF)
 * - Cadernos de Descritores (PDF)
 *
 * Pipeline:
 * 1. Extração de texto (Unstructured / pdf-parse)
 * 2. Chunking (1 questão = 1 chunk)
 * 3. Enriquecimento com metadados (descritor, série, disciplina)
 * 4. Geração de embeddings (text-embedding-3-small)
 * 5. Armazenamento no banco vetorial (pgvector ou Pinecone)
 *
 * Uso: tsx prisma/seed/rag/ingest-materials.ts
 */

console.log("TODO: Implementar ingestão RAG na Semana 3");
