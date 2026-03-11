// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
import mammoth from "mammoth";

export interface ExtractedImage {
  base64: string;
  contentType: string;
}

export interface ExtractionResult {
  text: string;
  images: ExtractedImage[];
}

export async function extractFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text.trim();
}

/**
 * Extrai texto puro de DOCX (sem imagens). Compatibilidade com fluxo antigo.
 */
export async function extractFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/**
 * Extrai texto E imagens de DOCX.
 * Imagens são substituídas por placeholders [__IMG_N__] no texto.
 * Retorna o texto com placeholders e o array de imagens em paralelo.
 */
export async function extractFromDocxWithImages(buffer: Buffer): Promise<ExtractionResult> {
  const images: ExtractedImage[] = [];

  const result = await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const base64 = await image.read("base64");
      const idx = images.length;
      images.push({ base64, contentType: image.contentType });
      return { src: `__IMG_PLACEHOLDER_${idx}__` };
    }),
  });

  // Converter HTML para texto preservando placeholders de imagem
  const text = result.value
    // Converter tags de imagem em placeholders textuais
    .replace(/<img[^>]*src="(__IMG_PLACEHOLDER_\d+__)"[^>]*\/?>/gi, "\n[$1]\n")
    // Preservar quebras de linha
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, " | ")
    // Remover demais tags HTML
    .replace(/<[^>]+>/g, "")
    // Decodificar entidades HTML
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    // Limpar espaçamento excessivo
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, images };
}

export async function extractFromTxt(buffer: Buffer): Promise<string> {
  return buffer.toString("utf-8").trim();
}

export function detectMimeType(filename: string): "pdf" | "docx" | "txt" | "text" {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "txt") return "txt";
  return "text";
}
