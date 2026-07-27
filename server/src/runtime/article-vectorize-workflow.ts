import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import * as schema from "../db/schema";
import { feedVectorIndexes, feeds } from "../db/schema";
import {
  ARTICLE_EMBEDDING_MODEL,
  ARTICLE_VECTOR_BATCH_SIZE,
  articleVectorId,
  buildArticleEmbeddingText,
  chunkArticleText,
  extractEmbeddingVectors,
  hashArticleForVectorIndex,
  isWorkersAIRateLimitError,
  nextWorkersAIResetAt,
} from "./article-vectorize";

export type ArticleVectorizeParams = {
  feedId: number;
  isDelete?: boolean;
  chunkCount?: number;
};

type LoadedArticle = {
  id: number;
  alias: string | null;
  title: string | null;
  summary: string;
  ai_summary: string;
  content: string;
  language: string;
  listed: number;
  draft: number;
  updatedAt: string | null;
};

type ExistingIndexState = {
  feedId: number;
  contentHash: string;
  chunkCount: number;
  status: string;
};

function toIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  return typeof value === "string" ? value : null;
}

async function deleteVectorIds(index: any, feedId: number, chunkCount: number) {
  for (let offset = 0; offset < chunkCount; offset += 100) {
    const ids = Array.from({ length: Math.min(100, chunkCount - offset) }, (_, itemIndex) => articleVectorId(feedId, offset + itemIndex));
    await index.deleteByIds(ids);
  }
}

export class ArticleVectorizeWorkflow extends WorkflowEntrypoint<Env, ArticleVectorizeParams> {
  async run(event: WorkflowEvent<ArticleVectorizeParams>, step: WorkflowStep) {
    const { feedId, isDelete, chunkCount } = event.payload;

    if (!this.env.DB || !this.env.AI || !this.env.ARTICLE_VECTORIZE) {
      console.warn("Missing DB, AI, or ARTICLE_VECTORIZE binding, skipping article vectorization.");
      return;
    }

    const db = drizzle(this.env.DB, { schema });

    const existingState = await step.do(`load-vector-state-${feedId}`, async (): Promise<ExistingIndexState | null> => {
      const state = await db.query.feedVectorIndexes.findFirst({
        where: eq(feedVectorIndexes.feedId, feedId),
        columns: { feedId: true, contentHash: true, chunkCount: true, status: true },
      });
      return state ?? null;
    });

    if (isDelete) {
      const deleteCount = chunkCount ?? existingState?.chunkCount ?? 0;
      if (deleteCount > 0) {
        await step.do(`delete-vectors-${feedId}-${deleteCount}`, async () => {
          await deleteVectorIds(this.env.ARTICLE_VECTORIZE, feedId, deleteCount);
        });
      }
      return;
    }

    const article = await step.do(`load-article-${feedId}`, async (): Promise<LoadedArticle | null> => {
      const feed = await db.query.feeds.findFirst({ where: eq(feeds.id, feedId) });
      if (!feed) {
        return null;
      }
      return {
        id: feed.id,
        alias: feed.alias,
        title: feed.title,
        summary: feed.summary,
        ai_summary: feed.ai_summary,
        content: feed.content,
        language: feed.language,
        listed: feed.listed,
        draft: feed.draft,
        updatedAt: toIsoDate(feed.updatedAt),
      };
    });

    if (!article) {
      return;
    }

    if (article.draft === 1) {
      const deleteCount = existingState?.chunkCount ?? 0;
      if (deleteCount > 0) {
        await step.do(`delete-draft-vectors-${feedId}-${deleteCount}`, async () => {
          await deleteVectorIds(this.env.ARTICLE_VECTORIZE, feedId, deleteCount);
        });
      }
      await step.do(`mark-vector-idle-${feedId}`, async () => {
        await db.insert(feedVectorIndexes).values({
          feedId,
          contentHash: "",
          chunkCount: 0,
          status: "idle",
          error: "",
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: feedVectorIndexes.feedId,
          set: { contentHash: "", chunkCount: 0, status: "idle", error: "", updatedAt: new Date() },
        });
      });
      return;
    }

    const contentHash = hashArticleForVectorIndex(article);
    if (existingState?.contentHash === contentHash && existingState.status === "completed") {
      return;
    }

    const text = buildArticleEmbeddingText(article);
    const chunks = chunkArticleText(text);

    if (chunks.length === 0) {
      return;
    }

    await step.do(`mark-vector-processing-${feedId}-${contentHash}`, async () => {
      await db.insert(feedVectorIndexes).values({
        feedId,
        contentHash,
        chunkCount: existingState?.chunkCount ?? 0,
        status: "processing",
        error: "",
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: feedVectorIndexes.feedId,
        set: { contentHash, status: "processing", error: "", updatedAt: new Date() },
      });
    });

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex += ARTICLE_VECTOR_BATCH_SIZE) {
      const batch = chunks.slice(batchIndex, batchIndex + ARTICLE_VECTOR_BATCH_SIZE);
      let attempt = 0;

      while (true) {
        const result = await step.do(`embed-upsert-${feedId}-${contentHash}-${batchIndex}-attempt-${attempt}`, async () => {
          try {
            const embeddings = extractEmbeddingVectors(await this.env.AI.run(ARTICLE_EMBEDDING_MODEL, { text: batch }));
            if (embeddings.length !== batch.length) {
              throw new Error(`Expected ${batch.length} embeddings, got ${embeddings.length}`);
            }

            const vectors = embeddings.map((values, itemIndex) => {
              const chunkIndex = batchIndex + itemIndex;
              return {
                id: articleVectorId(feedId, chunkIndex),
                values,
                metadata: {
                  feedId,
                  chunk: chunkIndex,
                  language: article.language,
                  title: article.title || "",
                  alias: article.alias || "",
                  path: article.alias ? `/${encodeURIComponent(article.alias)}` : `/feed/${feedId}`,
                  updatedAt: article.updatedAt || "",
                  contentHash,
                },
              };
            });

            await this.env.ARTICLE_VECTORIZE.upsert(vectors);
            return { status: "ok" as const };
          } catch (error) {
            if (isWorkersAIRateLimitError(error)) {
              return { status: "rate_limited" as const, message: error instanceof Error ? error.message : String(error) };
            }
            throw error;
          }
        });

        if (result.status === "ok") {
          break;
        }

        await step.do(`mark-vector-rate-limited-${feedId}-${contentHash}-${batchIndex}-${attempt}`, async () => {
          await db.update(feedVectorIndexes).set({
            status: "rate_limited",
            error: result.message.slice(0, 500),
            updatedAt: new Date(),
          }).where(eq(feedVectorIndexes.feedId, feedId));
        });

        await step.sleepUntil(
          `wait-workers-ai-reset-${feedId}-${contentHash}-${batchIndex}-${attempt}`,
          nextWorkersAIResetAt(),
        );
        attempt += 1;
      }
    }

    const oldChunkCount = existingState?.chunkCount ?? 0;
    if (oldChunkCount > chunks.length) {
      await step.do(`delete-stale-vectors-${feedId}-${oldChunkCount}-${chunks.length}`, async () => {
        for (let chunkIndex = chunks.length; chunkIndex < oldChunkCount; chunkIndex += 100) {
          const ids = Array.from({ length: Math.min(100, oldChunkCount - chunkIndex) }, (_, itemIndex) => articleVectorId(feedId, chunkIndex + itemIndex));
          await this.env.ARTICLE_VECTORIZE.deleteByIds(ids);
        }
      });
    }

    await step.do(`mark-vector-completed-${feedId}-${contentHash}`, async () => {
      await db.update(feedVectorIndexes).set({
        contentHash,
        chunkCount: chunks.length,
        status: "completed",
        error: "",
        updatedAt: new Date(),
      }).where(eq(feedVectorIndexes.feedId, feedId));
    });
  }
}
