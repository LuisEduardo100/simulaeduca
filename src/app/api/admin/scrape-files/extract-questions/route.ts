import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  extractFromPdf,
  extractFromDocx,
  extractFromTxt,
} from "@/lib/ai/rag/extractors";
import { extractQuestionsFromText } from "@/lib/ai/agents/question-extractor";

const schema = z.object({
  url: z.string().url(),
  filename: z.string().min(1),
  type: z.enum(["pdf", "docx", "txt"]),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { url, filename, type } = parsed.data;

    // Download do arquivo com timeout de 30s
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SimulaEduca/1.0)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Falha ao baixar arquivo: HTTP ${response.status}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Extrair texto
    let text: string;
    if (type === "pdf") {
      text = await extractFromPdf(buffer);
    } else if (type === "docx") {
      text = await extractFromDocx(buffer);
    } else {
      text = await extractFromTxt(buffer);
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Nao foi possivel extrair texto do arquivo." },
        { status: 400 }
      );
    }

    const textLength = text.length;
    const wasTruncated = textLength > 40000;

    // Extrair questoes com IA
    const questions = await extractQuestionsFromText(text);

    return NextResponse.json({
      questions,
      total: questions.length,
      filename,
      textLength,
      wasTruncated,
    });
  } catch (error) {
    console.error("[scrape-files/extract-questions] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar arquivo." },
      { status: 500 }
    );
  }
}
