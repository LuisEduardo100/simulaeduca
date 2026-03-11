import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/utils/auth";
import { readQuestionImageBuffer } from "@/lib/utils/image-storage";

// GET /api/question-images?path=storage/question-images/xxx.png
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const imagePath = request.nextUrl.searchParams.get("path");
  if (!imagePath) {
    return NextResponse.json({ error: "path é obrigatório." }, { status: 400 });
  }

  // Validar que o path é de question-images (prevenir path traversal)
  if (!imagePath.startsWith("storage/question-images/") || imagePath.includes("..")) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  const result = await readQuestionImageBuffer(imagePath);
  if (!result) {
    return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
