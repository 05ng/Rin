import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { DB } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { feedHashtags, feedVectorIndexes, hashtags } from "../db/schema";
import type { AppContext } from "../core/hono-types";

async function attachVectorizedStatus<T extends { id: number }>(db: DB, rows: T[]): Promise<Array<T & { vectorized: boolean }>> {
    if (rows.length === 0) {
        return rows.map((row) => ({ ...row, vectorized: false }));
    }

    const ids = Array.from(new Set(rows.map((row) => row.id).filter((id) => Number.isSafeInteger(id))));
    if (ids.length === 0) {
        return rows.map((row) => ({ ...row, vectorized: false }));
    }

    const states = await db.query.feedVectorIndexes.findMany({
        where: inArray(feedVectorIndexes.feedId, ids),
        columns: { feedId: true, chunkCount: true, status: true },
    });
    const vectorizedIds = new Set(states
        .filter((state) => state.status === "completed" && state.chunkCount > 0)
        .map((state) => state.feedId));

    return rows.map((row) => ({ ...row, vectorized: vectorizedIds.has(row.id) }));
}

export function TagService(): Hono {
    const app = new Hono();

    // GET /tag
    app.get('/', async (c: AppContext) => {
        const db = c.get('db');
        
        const tag_list = await profileAsync(c, 'tag_list_db', () => db.query.hashtags.findMany({
            with: {
                feeds: { columns: { feedId: true } }
            }
        }));
        
        const result = tag_list.map((tag: any) => ({
            ...tag,
            feeds: tag.feeds.length
        }));
        
        return c.json(result);
    });

    // GET /tag/:name
    app.get('/:name', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const nameDecoded = decodeURI(c.req.param('name'));
        
        const tag = await profileAsync(c, 'tag_detail_db', () => db.query.hashtags.findFirst({
            where: eq(hashtags.name, nameDecoded),
            with: {
                feeds: {
                    with: {
                        feed: {
                            columns: {
                                id: true, title: true, summary: true, content: true, 
                                createdAt: true, updatedAt: true, draft: false, listed: false
                            },
                            with: {
                                user: { columns: { id: true, username: true, avatar: true } },
                                hashtags: {
                                    columns: {},
                                    with: { hashtag: { columns: { id: true, name: true } } }
                                }
                            },
                            where: (feeds: any) => admin ? undefined : and(eq(feeds.draft, 0), eq(feeds.listed, 1))
                        } as any
                    }
                }
            }
        }));
        
        if (!tag) {
            return c.text('Not found', 404);
        }
        
        const tagFeeds = tag.feeds.map((tagFeed: any) => {
            if (!tagFeed.feed) return null;
            return {
                ...tagFeed.feed,
                hashtags: tagFeed.feed.hashtags.map((hashtag: any) => hashtag.hashtag)
            };
        }).filter((feed: any) => feed !== null);
        const feedsWithVectorStatus = await profileAsync(c, 'tag_detail_vector_status', () => attachVectorizedStatus(db, tagFeeds ?? []));
        
        return c.json({ ...tag, feeds: feedsWithVectorStatus });
    });

    return app;
}

export async function bindTagToPost(db: DB, feedId: number, tags: string[]) {
    await db.delete(feedHashtags).where(eq(feedHashtags.feedId, feedId));
    
    for (const tag of tags) {
        const tagId = await getTagIdOrCreate(db, tag);
        await db.insert(feedHashtags).values({
            feedId: feedId,
            hashtagId: tagId
        });
    }
}

async function getTagByName(db: DB, name: string) {
    return await db.query.hashtags.findFirst({ where: eq(hashtags.name, name) });
}

async function getTagIdOrCreate(db: DB, name: string) {
    const tag = await getTagByName(db, name);
    if (tag) {
        return tag.id;
    } else {
        const result = await db.insert(hashtags).values({ name }).returning({ insertedId: hashtags.id });
        if (result.length === 0) {
            throw new Error('Failed to insert');
        } else {
            return result[0].insertedId;
        }
    }
}
