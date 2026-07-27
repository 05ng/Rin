import { stripMarkdown } from "../utils/markdown";

export const ARTICLE_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const ARTICLE_EMBEDDING_DIMENSIONS = 768;
export const ARTICLE_VECTOR_BATCH_SIZE = 8;

const DEFAULT_MAX_CHARS = 500;
const DEFAULT_OVERLAP_CHARS = 80;

export type ArticleEmbeddingSource = {
  id: number;
  alias?: string | null;
  title?: string | null;
  summary?: string | null;
  ai_summary?: string | null;
  content: string;
  language: string;
  updatedAt?: Date | number | string | null;
};

export function normalizeArticleText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildArticleEmbeddingText(article: ArticleEmbeddingSource) {
  return normalizeArticleText([
    article.title,
    article.summary,
    article.ai_summary,
    stripMarkdown(article.content),
  ].filter(Boolean).join("\n\n"));
}

function splitLongPart(part: string, maxChars: number) {
  const chunks: string[] = [];
  for (let index = 0; index < part.length; index += maxChars) {
    chunks.push(part.slice(index, index + maxChars));
  }
  return chunks;
}

export function chunkArticleText(text: string, options: { maxChars?: number; overlapChars?: number } = {}) {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 3));
  const normalized = normalizeArticleText(text);

  if (!normalized) {
    return [];
  }

  const parts = normalized
    .split(/(?<=[.!?。！？])\s+|\n{2,}/)
    .flatMap((part) => part.length > maxChars ? splitLongPart(part, maxChars) : [part])
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const next = current ? `${current} ${part}` : part;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
      const overlap = current.slice(Math.max(0, current.length - overlapChars));
      current = overlap ? `${overlap} ${part}` : part;
    } else {
      current = part;
    }

    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars));
      current = current.slice(maxChars - overlapChars);
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function articleVectorId(feedId: number, chunkIndex: number) {
  return `feed:${feedId}:chunk:${chunkIndex}`;
}

export function hashArticleForVectorIndex(article: ArticleEmbeddingSource) {
  const value = JSON.stringify({
    title: article.title || "",
    summary: article.summary || "",
    ai_summary: article.ai_summary || "",
    content: article.content,
    language: article.language,
  });

  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function extractEmbeddingVectors(response: any): number[][] {
  const data = response?.data ?? response?.result?.data ?? response?.embeddings ?? response?.result?.embeddings;

  if (!Array.isArray(data)) {
    return [];
  }

  if (Array.isArray(data[0])) {
    return data as number[][];
  }

  if (Array.isArray(data[0]?.embedding)) {
    return data.map((item: { embedding: number[] }) => item.embedding);
  }

  return [];
}

export function isWorkersAIRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  return lower.includes("7505")
    || lower.includes("rate limit")
    || lower.includes("too many requests")
    || lower.includes("quota")
    || lower.includes("free tier")
    || lower.includes("limit exceeded");
}

export function nextWorkersAIResetAt(now = new Date()) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    5,
    0,
    0,
  ));
}
