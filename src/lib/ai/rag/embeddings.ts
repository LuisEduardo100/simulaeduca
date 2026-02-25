import { OpenAIEmbeddings } from "@langchain/openai";

const embeddingsModel = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  dimensions: 1536,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await embeddingsModel.embedQuery(text);
  return result;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results = await embeddingsModel.embedDocuments(texts);
  return results;
}
