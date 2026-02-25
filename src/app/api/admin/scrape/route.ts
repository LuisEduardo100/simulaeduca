import { auth } from "@/lib/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const scrapeSchema = z.object({
  url: z.string().url("URL inválida."),
});

function extractTextFromHtml(html: string): { text: string; title: string } {
  // Extrair título
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "Sem título";

  // Remover scripts e styles
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ");

  // Adicionar quebras de linha em elementos de bloco
  text = text
    .replace(/<\/?(p|div|br|li|h[1-6]|tr|td|th|blockquote|pre)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|tbody|thead)[^>]*>/gi, "\n");

  // Remover todas as demais tags HTML
  text = text.replace(/<[^>]+>/g, " ");

  // Decodificar entidades HTML comuns
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&atilde;/g, "ã")
    .replace(/&otilde;/g, "õ")
    .replace(/&ccedil;/g, "ç")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  // Limpar espaços e linhas em branco excessivas
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Limitar tamanho
  const MAX_CHARS = 50000;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + "\n\n[... conteúdo truncado ...]";
  }

  return { text, title };
}

// POST /api/admin/scrape — extrair texto de uma URL
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = scrapeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { url } = parsed.data;

  // Bloquear URLs internas e de loopback
  const urlObj = new URL(url);
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
  if (blockedHosts.some((h) => urlObj.hostname === h || urlObj.hostname.endsWith(".local"))) {
    return NextResponse.json({ error: "URL não permitida." }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SimulaEduca/1.0; +https://simulaeduca.com.br)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
    const { text, title } = extractTextFromHtml(html);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({ text, title, wordCount, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";

    if (message.includes("timeout") || message.includes("TimeoutError")) {
      return NextResponse.json(
        { error: "A URL demorou muito para responder (timeout de 15s)." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: `Erro ao acessar a URL: ${message}` },
      { status: 500 }
    );
  }
}
