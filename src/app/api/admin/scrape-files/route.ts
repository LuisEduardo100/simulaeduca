import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOrNull } from "@/lib/cache/rate-limiter";

const schema = z.object({
  url: z.string().url("URL inválida."),
});

export interface FoundFile {
  url: string;
  filename: string;
  type: "pdf" | "docx" | "txt";
  answerKey?: string; // gabarito encontrado na página, ex: "1-A, 2-C, 3-B, 4-D"
}

// Parsed answer key: question number → letter
export interface ParsedAnswerKey {
  [questionNumber: number]: string; // "A"|"B"|"C"|"D"
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Extrai gabaritos (answer keys) do HTML da página.
 * Detecta padrões como:
 * - "Gabarito: 1-A, 2-C, 3-B, 4-D..."
 * - "GABARITO  01) A  02) C  03) B..."
 * - "1.A 2.C 3.B 4.D"
 * - "1-A / 2-C / 3-B"
 * Retorna array de gabaritos encontrados, na ordem que aparecem na página.
 */
function extractAnswerKeys(html: string): string[] {
  // Remover tags HTML, preservar quebras de linha
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|tr|td|th|h[1-6]|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
  const decoded = decodeHTMLEntities(text);

  const results: string[] = [];

  // Padrão 1: "Gabarito" seguido de lista de respostas na mesma região
  const gabaritoRegex = /gabarito[s]?\s*[:.\-—]\s*([\s\S]{10,500}?)(?=gabarito|$)/gi;
  let m;
  while ((m = gabaritoRegex.exec(decoded)) !== null) {
    const block = m[1].trim();
    // Extrair pares questão-resposta do bloco
    const pairs = parseAnswerPairs(block);
    if (pairs.length >= 3) {
      results.push(pairs.map((p) => `${p.num}-${p.letter}`).join(", "));
    }
  }

  return results;
}

/**
 * Parsea pares questão-resposta de texto livre.
 * Suporta: "1-A, 2-C", "01) A  02) C", "1.A 2.C", "1-A / 2-C"
 */
function parseAnswerPairs(text: string): { num: number; letter: string }[] {
  const pairs: { num: number; letter: string }[] = [];
  const seen = new Set<number>();

  // Padrão genérico: número + separador + letra (A-D)
  const pairRegex = /(\d{1,3})\s*[).\-–—:]\s*([A-Da-d])\b/g;
  let m;
  while ((m = pairRegex.exec(text)) !== null) {
    const num = parseInt(m[1], 10);
    const letter = m[2].toUpperCase();
    if (num > 0 && num <= 100 && !seen.has(num)) {
      pairs.push({ num, letter });
      seen.add(num);
    }
  }

  return pairs.sort((a, b) => a.num - b.num);
}

/**
 * Correlaciona gabaritos com arquivos.
 * Estratégia: busca o gabarito mais próximo (no HTML) de cada link de arquivo.
 * Se há N arquivos e N gabaritos, associa 1:1 na ordem.
 * Se há 1 gabarito e N arquivos, associa o gabarito ao arquivo mais próximo.
 */
function correlateAnswerKeys(
  files: FoundFile[],
  html: string,
  answerKeys: string[]
): FoundFile[] {
  if (answerKeys.length === 0 || files.length === 0) return files;

  // Se contagem bate, associar 1:1
  if (answerKeys.length === files.length) {
    return files.map((f, i) => ({ ...f, answerKey: answerKeys[i] }));
  }

  // Caso contrário: correlacionar por posição no HTML
  // Encontrar posição de cada link e cada gabarito no texto
  const textOnly = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const filePositions = files.map((f) => {
    const idx = textOnly.indexOf(f.filename);
    return { file: f, pos: idx >= 0 ? idx : Infinity };
  });

  const gabPositions = answerKeys.map((gab) => {
    // Buscar a primeira parte do gabarito no texto
    const firstPart = gab.split(",")[0].trim();
    const searchStr = firstPart.replace("-", "");
    const idx = textOnly.indexOf(searchStr);
    return { gab, pos: idx >= 0 ? idx : Infinity };
  });

  // Para cada arquivo, encontrar o gabarito mais próximo (que aparece DEPOIS dele)
  return filePositions.map(({ file, pos }) => {
    let bestGab: string | undefined;
    let bestDist = Infinity;

    for (const { gab, pos: gabPos } of gabPositions) {
      const dist = Math.abs(gabPos - pos);
      if (dist < bestDist) {
        bestDist = dist;
        bestGab = gab;
      }
    }

    return bestGab ? { ...file, answerKey: bestGab } : file;
  });
}

function extractFileLinks(html: string, baseUrl: string): FoundFile[] {
  const found: FoundFile[] = [];
  const seen = new Set<string>();

  // Captura <a href="...">texto</a> incluindo conteúdo interno (para inferir tipo)
  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let rawHref = match[1].trim();
    let href = decodeHTMLEntities(rawHref);
    // Texto visível do link (strip inner tags)
    const linkText = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      continue;
    }

    // Resolver URL relativa
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    const urlObj = new URL(href);
    const urlPath = urlObj.pathname.toLowerCase();

    let type: "pdf" | "docx" | "txt" | null = null;
    let resolvedHref = href;
    let filename = "";

    // 1. Extensão direta no pathname
    if (urlPath.endsWith(".pdf")) type = "pdf";
    else if (urlPath.endsWith(".docx") || urlPath.endsWith(".doc")) type = "docx";
    else if (urlPath.endsWith(".txt")) type = "txt";

    // 2. Extensão em query params (ex: ?file=simulado.docx ou &title=prova.pdf)
    if (!type) {
      for (const val of urlObj.searchParams.values()) {
        const v = val.toLowerCase();
        if (v.endsWith(".pdf")) { type = "pdf"; break; }
        if (v.endsWith(".docx") || v.endsWith(".doc")) { type = "docx"; break; }
        if (v.endsWith(".txt")) { type = "txt"; break; }
      }
    }

    // 3. Google Drive — drive.google.com/file/d/{id}/ ou /open?id= ou /uc?id=
    if (!type) {
      const driveFile = href.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
      const driveOpen = href.match(/drive\.google\.com\/(?:open|uc)[^?]*\?.*[?&]id=([^&]+)/);
      const fileId = driveFile?.[1] ?? driveOpen?.[1];

      if (fileId) {
        resolvedHref = `https://drive.google.com/uc?export=download&id=${fileId}`;
        // Inferir tipo pelo texto do link
        if (linkText.includes(".pdf") || linkText.includes(" pdf")) type = "pdf";
        else if (linkText.includes(".docx") || linkText.includes(".doc") || linkText.includes("word")) type = "docx";
        else type = "pdf"; // default para Google Drive = geralmente PDF/DOCX de provas
        filename = `drive-${fileId.slice(0, 8)}.${type}`;
      }
    }

    // 4. Tipo inferido pelo texto do link (ex: link diz "simulado.docx" ou "Baixar PDF")
    if (!type) {
      if (linkText.match(/\.pdf\b/)) type = "pdf";
      else if (linkText.match(/\.docx?\b/)) type = "docx";
      else if (linkText.match(/\.txt\b/)) type = "txt";
    }

    if (!type) continue;
    if (seen.has(resolvedHref)) continue;
    seen.add(resolvedHref);

    if (!filename) {
      const rawName = decodeURIComponent(urlPath.split("/").pop() ?? "");
      filename = rawName || `arquivo-${found.length + 1}.${type}`;
    }

    found.push({ url: resolvedHref, filename, type });
  }

  return found;
}

// POST /api/admin/scrape-files — escanear página e retornar lista de arquivos
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const rl = await rateLimitOrNull(session.user.id, "scraping");
  if (rl) {
    return NextResponse.json({ error: rl.error }, { status: rl.status, headers: rl.headers });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { url } = parsed.data;

  // Bloquear URLs internas
  const urlObj = new URL(url);
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
  if (blockedHosts.some((h) => urlObj.hostname === h || urlObj.hostname.endsWith(".local"))) {
    return NextResponse.json({ error: "URL não permitida." }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SimulaEduca/1.0; +https://simulaeduca.com.br)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Erro ao acessar a URL: ${response.status} ${response.statusText}` },
        { status: 422 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return NextResponse.json(
        { error: `Tipo de conteúdo não suportado: ${contentType}. Use URLs de páginas HTML.` },
        { status: 422 }
      );
    }

    const html = await response.text();
    let files = extractFileLinks(html, url);

    // Extrair gabaritos da página e correlacionar com arquivos
    const answerKeys = extractAnswerKeys(html);
    if (answerKeys.length > 0) {
      files = correlateAnswerKeys(files, html, answerKeys);
    }

    // Cross-reference com scraped_sources para dedup
    const { prisma: db } = await import("@/lib/db/prisma");
    const fileUrls = files.map((f) => f.url);
    const existingSources = fileUrls.length > 0
      ? await db.scrapedSource.findMany({
          where: { fileUrl: { in: fileUrls }, extractionMode: "smart" },
          select: { fileUrl: true, status: true, questionsFound: true, questionsIngested: true },
        })
      : [];
    const existingMap = new Map(existingSources.map((e) => [e.fileUrl, e]));

    const filesWithDedup = files.map((f) => {
      const prev = existingMap.get(f.url);
      return {
        ...f,
        alreadyProcessed: prev ? (prev.status === "extracted" || prev.status === "ingested") : false,
        previousStatus: prev?.status ?? null,
        questionsFound: prev?.questionsFound ?? null,
        answerKey: f.answerKey ?? null,
      };
    });

    return NextResponse.json({ files: filesWithDedup, total: files.length, pageUrl: url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    if (message.includes("timeout") || message.includes("TimeoutError")) {
      return NextResponse.json({ error: "A URL demorou muito para responder (timeout 15s)." }, { status: 504 });
    }
    return NextResponse.json({ error: `Erro ao acessar a URL: ${message}` }, { status: 500 });
  }
}

// GET /api/admin/scrape-files — listar fontes já raspadas
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const { prisma } = await import("@/lib/db/prisma");

  const sources = await prisma.scrapedSource.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      pageUrl: true,
      fileName: true,
      fileUrl: true,
      fileType: true,
      fileSize: true,
      chunksCreated: true,
      descriptorCode: true,
      subjectSlug: true,
      gradeLevelSlug: true,
      evaluationSlug: true,
      difficulty: true,
      createdAt: true,
    },
  });

  return NextResponse.json(sources);
}

// DELETE /api/admin/scrape-files?id=... — remover registro de fonte raspada
export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
  }

  const { prisma } = await import("@/lib/db/prisma");

  const source = await prisma.scrapedSource.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json({ error: "Fonte não encontrada." }, { status: 404 });
  }

  // Remover chunks do RAG associados
  const { deleteMaterialBySource } = await import("@/lib/ai/rag/ingest");
  const deleted = await deleteMaterialBySource(source.fileName);

  await prisma.scrapedSource.delete({ where: { id } });

  return NextResponse.json({ success: true, chunksRemoved: deleted });
}
