import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { ingestMaterial, deleteMaterialBySource, listMaterials } from "@/lib/ai/rag/ingest";
import { extractFromPdf, extractFromDocx, extractFromTxt, detectMimeType } from "@/lib/ai/rag/extractors";

// GET /api/admin/ingest — listar materiais ingeridos
export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso não autorizado" }, { status: 403 });
  }

  const materials = await listMaterials();
  return NextResponse.json(materials);
}

// POST /api/admin/ingest — ingerir novo material
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso não autorizado" }, { status: 403 });
  }

  const formData = await request.formData();

  const file = formData.get("file") as File | null;
  const text = formData.get("text") as string | null;
  const descriptorCode = formData.get("descriptorCode") as string | null;
  const subjectSlug = formData.get("subjectSlug") as string | null;
  const gradeLevelSlug = formData.get("gradeLevelSlug") as string | null;
  const evaluationSlug = formData.get("evaluationSlug") as string | null;
  const difficulty = formData.get("difficulty") as string | null;

  if (!file && !text) {
    return NextResponse.json(
      { error: "É necessário fornecer um arquivo ou texto." },
      { status: 400 }
    );
  }

  let content = "";
  let sourceType: "pdf" | "docx" | "txt" | "text" = "text";
  let sourceFileName: string | undefined;

  if (file) {
    sourceFileName = file.name;
    sourceType = detectMimeType(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      if (sourceType === "pdf") {
        content = await extractFromPdf(buffer);
      } else if (sourceType === "docx") {
        content = await extractFromDocx(buffer);
      } else {
        content = await extractFromTxt(buffer);
        sourceType = "txt";
      }
    } catch {
      return NextResponse.json(
        { error: "Erro ao extrair texto do arquivo." },
        { status: 422 }
      );
    }
  } else if (text) {
    content = text;
    sourceType = "text";
    sourceFileName = `texto-manual-${Date.now()}.txt`;
  }

  if (!content.trim()) {
    return NextResponse.json(
      { error: "O conteúdo extraído está vazio." },
      { status: 400 }
    );
  }

  const result = await ingestMaterial({
    content,
    sourceType,
    sourceFileName,
    metadata: {
      descriptorCode: descriptorCode ?? undefined,
      subjectSlug: subjectSlug ?? undefined,
      gradeLevelSlug: gradeLevelSlug ?? undefined,
      evaluationSlug: evaluationSlug ?? undefined,
      difficulty: difficulty ?? undefined,
    },
    uploadedBy: session.user.id,
  });

  return NextResponse.json({ success: true, chunksCreated: result.chunksCreated });
}

// DELETE /api/admin/ingest?sourceFileName=... — remover material por fonte
export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso não autorizado" }, { status: 403 });
  }

  const sourceFileName = request.nextUrl.searchParams.get("sourceFileName");

  if (!sourceFileName) {
    return NextResponse.json({ error: "sourceFileName é obrigatório" }, { status: 400 });
  }

  const deleted = await deleteMaterialBySource(sourceFileName);
  return NextResponse.json({ success: true, deleted });
}
