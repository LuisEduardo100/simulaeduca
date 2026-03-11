import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE_DIR = path.join(process.cwd(), "storage", "question-images");

/**
 * Salva uma imagem (base64) no storage e retorna o caminho relativo.
 */
export async function saveQuestionImage(
  base64Data: string,
  contentType: string
): Promise<string> {
  await mkdir(STORAGE_DIR, { recursive: true });
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("gif")
      ? "gif"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
  const filename = `${randomUUID()}.${ext}`;
  const filePath = path.join(STORAGE_DIR, filename);
  const buffer = Buffer.from(base64Data, "base64");
  await writeFile(filePath, buffer);
  return `storage/question-images/${filename}`;
}

/**
 * Lê uma imagem do storage e retorna como data URI base64.
 */
export async function readQuestionImageAsDataUri(imageUrl: string): Promise<string | null> {
  try {
    const absPath = path.join(process.cwd(), imageUrl);
    const buffer = await readFile(absPath);
    const ext = path.extname(imageUrl).slice(1).toLowerCase();
    const mime =
      ext === "png" ? "image/png"
        : ext === "gif" ? "image/gif"
          : ext === "webp" ? "image/webp"
            : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Lê uma imagem e retorna o buffer raw + content type.
 */
export async function readQuestionImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const absPath = path.join(process.cwd(), imageUrl);
    const buffer = await readFile(absPath);
    const ext = path.extname(imageUrl).slice(1).toLowerCase();
    const contentType =
      ext === "png" ? "image/png"
        : ext === "gif" ? "image/gif"
          : ext === "webp" ? "image/webp"
            : "image/jpeg";
    return { buffer, contentType };
  } catch {
    return null;
  }
}
