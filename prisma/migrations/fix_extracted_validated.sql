-- Fix: questões extraídas com correctAnswer devem ser validated=true e quality_score=0.75
-- para serem elegíveis ao reuso via findReusableQuestion()
-- Executar manualmente: psql $DATABASE_URL -f prisma/migrations/fix_extracted_validated.sql

UPDATE question_bank
SET validated = true,
    quality_score = GREATEST(quality_score, 0.75)
WHERE origin = 'extracted'
  AND correct_answer IS NOT NULL
  AND correct_answer != ''
  AND validated = false;
