import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  extractFromPdf,
  extractFromDocx,
  extractFromTxt,
  detectMimeType,
} from "@/lib/ai/rag/extractors";
import { extractQuestionsFromText } from "@/lib/ai/agents/question-extractor";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado." },
        { status: 400 }
      );
    }

    // Extrair texto do arquivo
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = detectMimeType(file.name);
    let text: string;

    if (mimeType === "pdf") {
      text = await extractFromPdf(buffer);
    } else if (mimeType === "docx") {
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
      textLength,
      wasTruncated,
    });
  } catch (error) {
    console.error("[ingest/extract-from-file] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar arquivo." },
      { status: 500 }
    );
  }
}
