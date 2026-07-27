import { describe, expect, it } from "bun:test";
import {
  chunkArticleText,
  extractEmbeddingVectors,
  isWorkersAIRateLimitError,
  nextWorkersAIResetAt,
} from "../article-vectorize";

describe("chunkArticleText", () => {
  it("splits long articles into bounded overlapping chunks", () => {
    const chunks = chunkArticleText("a".repeat(3600), { maxChars: 1000, overlapChars: 100 });

    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);
    expect(chunks[1]?.startsWith("a".repeat(100))).toBe(true);
  });

  it("drops empty content", () => {
    expect(chunkArticleText("   \n\n  ")).toEqual([]);
  });
});

describe("extractEmbeddingVectors", () => {
  it("reads Workers AI embedding arrays", () => {
    expect(extractEmbeddingVectors({ data: [[1, 2], [3, 4]] })).toEqual([[1, 2], [3, 4]]);
  });

  it("reads object embedding shapes", () => {
    expect(extractEmbeddingVectors({ data: [{ embedding: [1, 2] }] })).toEqual([[1, 2]]);
  });
});

describe("Workers AI reset helpers", () => {
  it("detects rate and quota errors", () => {
    expect(isWorkersAIRateLimitError(new Error("AiError: 7505 rate limit exceeded"))).toBe(true);
    expect(isWorkersAIRateLimitError(new Error("quota exhausted for free tier"))).toBe(true);
  });

  it("returns the next UTC reset buffer", () => {
    expect(nextWorkersAIResetAt(new Date("2026-07-27T15:30:00Z")).toISOString()).toBe("2026-07-28T00:05:00.000Z");
  });
});
