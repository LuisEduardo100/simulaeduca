import { auth } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/fix-question-bank
 * One-time fix: mark extracted questions with correctAnswer as validated=true
 * so they become eligible for reuse via findReusableQuestion().
 * Also cleans up stems that contain duplicate options.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // 1. Fix validated flag and quality_score for extracted questions with correctAnswer
  const validatedResult = await prisma.$executeRawUnsafe(`
    UPDATE question_bank
    SET validated = true,
        quality_score = GREATEST(quality_score, 0.75)
    WHERE origin = 'extracted'
      AND correct_answer IS NOT NULL
      AND correct_answer != ''
      AND validated = false
  `);

  // 2. Clean stems with duplicate options (A/B/C/D at the end)
  // Fetch questions where stem likely has embedded options
  const questionsToClean = await prisma.$queryRawUnsafe<
    { id: string; stem: string; option_a: string; option_b: string; option_c: string; option_d: string }[]
  >(`
    SELECT id, stem, option_a, option_b, option_c, option_d
    FROM question_bank
    WHERE origin = 'extracted'
      AND (
        stem LIKE '%' || chr(10) || 'A)%'
        OR stem LIKE '%' || chr(10) || '(A)%'
        OR stem LIKE '% A) %B) %C) %D) %'
      )
    LIMIT 500
  `);

  let stemsCleaned = 0;
  for (const q of questionsToClean) {
    const cleaned = stripOptionsFromStem(q.stem, q.option_a, q.option_b, q.option_c, q.option_d);
    if (cleaned !== q.stem) {
      await prisma.$executeRawUnsafe(
        `UPDATE question_bank SET stem = $1 WHERE id = $2::uuid`,
        cleaned,
        q.id
      );
      stemsCleaned++;
    }
  }

  return NextResponse.json({
    validatedFixed: validatedResult,
    stemsCleaned,
    totalChecked: questionsToClean.length,
  });
}

/**
 * Strip option patterns from stem when they duplicate optionA/B/C/D fields.
 */
function stripOptionsFromStem(
  stem: string,
  optA: string,
  optB: string,
  optC: string,
  optD: string
): string {
  // Try to find where options start in the stem
  // Common patterns: "\nA) ...", "\n(A) ...", "A) ... B) ... C) ... D) ..."
  const patterns = [
    // Newline + letter patterns
    /\n\s*\(?A\)?\s*[\s\S]+$/,
    // Inline patterns: " A) text B) text C) text D) text" at end
    /\s+\(?A\)?\s+[\s\S]+\(?B\)?\s+[\s\S]+\(?C\)?\s+[\s\S]+\(?D\)?\s+[\s\S]+$/,
  ];

  for (const pattern of patterns) {
    const match = stem.match(pattern);
    if (match) {
      const candidate = stem.slice(0, match.index).trim();
      // Verify we're not cutting too much — at least 30 chars of stem should remain
      if (candidate.length >= 30) {
        // Extra check: the cut portion should contain at least one option text
        const cutPortion = match[0].toLowerCase();
        if (
          cutPortion.includes(optA.toLowerCase().slice(0, 20)) ||
          cutPortion.includes(optB.toLowerCase().slice(0, 20))
        ) {
          return candidate;
        }
      }
    }
  }

  return stem;
}
