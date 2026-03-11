-- HNSW indexes para busca vetorial performática em pgvector
-- Reduz queries RAG de O(n) sequential scan para O(log n) com HNSW

-- Índice HNSW em material_chunks (usado pelo retriever RAG)
CREATE INDEX IF NOT EXISTS idx_material_chunks_embedding
  ON material_chunks USING hnsw (embedding vector_cosine_ops);

-- Índice HNSW em question_bank (usado para dedup semântico e busca de questões)
CREATE INDEX IF NOT EXISTS idx_question_bank_embedding
  ON question_bank USING hnsw (embedding vector_cosine_ops);

-- Índices B-tree em colunas de filtro frequentes no retriever
CREATE INDEX IF NOT EXISTS idx_material_chunks_descriptor
  ON material_chunks (descriptor_code);

CREATE INDEX IF NOT EXISTS idx_material_chunks_subject_grade
  ON material_chunks (subject_slug, grade_level_slug);

-- Índice em exams para queries por user + status (dashboard do professor)
CREATE INDEX IF NOT EXISTS idx_exams_user_status
  ON exams (user_id, status);
