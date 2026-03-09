import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractQuestionsFromText } from "@/lib/ai/agents/question-extractor";

const schema = z.object({
  text: z
    .string()
    .min(50, "Texto muito curto para extrair questões.")
    .max(60000, "Texto excede o limite de 60.000 caracteres."),
});

// POST /api/admin/scrape/extract-questions
// Recebe texto limpo de uma página HTML e usa IA (gpt-4o) para extrair
// questões estruturadas com descriptor, dificuldade e gabarito detectados.
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const questions = await extractQuestionsFromText(parsed.data.text);
    return NextResponse.json({ questions, total: questions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Erro na extração com IA: ${message}` },
      { status: 500 }
    );
  }
}
