import { and, asc, count, desc, eq, gt, inArray, like, lt, ne, or } from "drizzle-orm";
import { SEARCH_VECTOR_SCORE_THRESHOLD_KEY, SERVER_CONFIG_DEFAULTS } from "@rin/config";
import type { SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB, Variables } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { feedVectorIndexes, feeds, visits, visitStats } from "../db/schema";
import { HyperLogLog } from "../utils/hyperloglog";
import { extractImageWithMetadata } from "../utils/image";
import { stripMarkdown } from "../utils/markdown";
import {
    ARTICLE_EMBEDDING_MODEL,
    extractEmbeddingVectors,
    isWorkersAIRateLimitError,
} from "../runtime/article-vectorize";
import { syncFeedAISummaryQueueState } from "./feed-ai-summary";
import { bindTagToPost } from "./tag";
import { clearFeedCache } from "./clear-feed-cache";
export { clearFeedCache } from "./clear-feed-cache";

// Lazy-loaded modules for WordPress import
let XMLParser: any;
let html2md: any;

function parseFeedId(value: string): number | null {
    if (!/^[1-9]\d*$/.test(value)) {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
}

const ARTICLE_LANGUAGES = ["en", "zh-CN"] as const;
type ArticleLanguage = (typeof ARTICLE_LANGUAGES)[number];

type TranslationGroupResolution =
    | { group: number | null }
    | { error: string };

function parseArticleLanguage(value: unknown): ArticleLanguage | null {
    return typeof value === "string" && ARTICLE_LANGUAGES.includes(value as ArticleLanguage)
        ? value as ArticleLanguage
        : null;
}

const DEFAULT_VECTOR_SCORE_THRESHOLD = Number(SERVER_CONFIG_DEFAULTS.get(SEARCH_VECTOR_SCORE_THRESHOLD_KEY) ?? 0.72);

function parseVectorScoreThreshold(value: unknown) {
    const parsed = typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length > 0
            ? Number(value.trim())
            : DEFAULT_VECTOR_SCORE_THRESHOLD;

    if (!Number.isFinite(parsed)) {
        return DEFAULT_VECTOR_SCORE_THRESHOLD;
    }

    return Math.min(1, Math.max(-1, parsed));
}

async function getVectorScoreThreshold(serverConfig: { getOrDefault<T>(key: string, defaultValue: T): Promise<T> }) {
    const value = await serverConfig.getOrDefault<unknown>(SEARCH_VECTOR_SCORE_THRESHOLD_KEY, DEFAULT_VECTOR_SCORE_THRESHOLD);
    return parseVectorScoreThreshold(value);
}

function articlePath(id: number, alias: string | null, language: ArticleLanguage | string) {
    const path = alias ? `/${encodeURIComponent(alias)}` : `/feed/${id}`;
    return language === "en" ? path : `/${language}${path}`;
}

function queueArticleVectorizeWorkflow(c: any, feedId: number, options: { isDelete?: boolean; chunkCount?: number } = {}) {
    const env = c.get('env');
    if (!env.ARTICLE_VECTORIZE_WORKFLOW) {
        return;
    }

    c.executionCtx.waitUntil(
        env.ARTICLE_VECTORIZE_WORKFLOW.create({
            params: { feedId, isDelete: options.isDelete, chunkCount: options.chunkCount },
        }).catch(console.error),
    );
}

function parseTranslationOf(value: unknown): number | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || value === "") {
        return null;
    }

    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
        ? value
        : undefined;
}

async function resolveTranslationGroup(
    db: DB,
    language: ArticleLanguage,
    translationOf: number | null,
    currentFeedId?: number,
): Promise<TranslationGroupResolution> {
    if (translationOf === null) {
        return { group: null };
    }

    const source = await db.query.feeds.findFirst({
        where: eq(feeds.id, translationOf),
        columns: { id: true, language: true, translationGroup: true },
    });
    if (!source) {
        return { error: "Selected translation article was not found" };
    }

    if (source.id === currentFeedId) {
        return { error: "An article cannot be its own translation" };
    }

    if (source.language === language) {
        return { error: "A translation must use a different language" };
    }

    const group = source.translationGroup ?? source.id;
    if (source.translationGroup === null) {
        await db.update(feeds).set({ translationGroup: group }).where(eq(feeds.id, source.id));
    }

    const conditions = [
        eq(feeds.translationGroup, group),
        eq(feeds.language, language),
    ];
    if (currentFeedId !== undefined) {
        conditions.push(ne(feeds.id, currentFeedId));
    }

    const existing = await db.query.feeds.findFirst({
        where: and(...conditions),
        columns: { id: true },
    });
    if (existing) {
        return { error: "This translation group already has an article in the selected language" };
    }

    return { group };
}

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

async function getFeedVectorized(db: DB, feedId: number) {
    const state = await db.query.feedVectorIndexes.findFirst({
        where: eq(feedVectorIndexes.feedId, feedId),
        columns: { chunkCount: true, status: true },
    });

    return state?.status === "completed" && state.chunkCount > 0;
}

type FeedVisitStats = {
    pv: number;
    hllData: string;
} | null;

function buildNextVisitStats(stats: FeedVisitStats, visitorKey: string) {
    const hll = stats?.hllData ? new HyperLogLog(stats.hllData) : new HyperLogLog();
    hll.add(visitorKey);

    return {
        hllData: hll.serialize(),
        pv: (stats?.pv ?? 0) + 1,
        uv: Math.round(hll.count()),
    };
}

async function persistFeedVisit(db: DB, feedId: number, visitorKey: string, stats: FeedVisitStats) {
    const nextStats = buildNextVisitStats(stats, visitorKey);

    await Promise.all([
        stats
            ? db.update(visitStats)
                .set({
                    pv: nextStats.pv,
                    hllData: nextStats.hllData,
                    updatedAt: new Date(),
                })
                .where(eq(visitStats.feedId, feedId))
            : db.insert(visitStats).values({
                feedId,
                pv: nextStats.pv,
                hllData: nextStats.hllData,
            }),
        db.insert(visits).values({ feedId, ip: visitorKey }),
    ]);
}

function getExecutionContext(c: AppContext) {
    try {
        return c.executionCtx;
    } catch {
        return undefined;
    }
}

function scheduleFeedVisitPersistence(c: AppContext, db: DB, feedId: number, visitorKey: string, stats: FeedVisitStats) {
    const task = persistFeedVisit(db, feedId, visitorKey, stats).catch((error) => {
        console.error("Failed to persist feed visit", error);
    });
    const executionCtx = getExecutionContext(c);

    if (executionCtx && typeof executionCtx.waitUntil === "function") {
        executionCtx.waitUntil(task);
        return;
    }

    void task;
}

async function initWPModules() {
    if (!XMLParser) {
        const fxp = await import("fast-xml-parser");
        XMLParser = fxp.XMLParser;
    }
    if (!html2md) {
        const h2m = await import("html-to-md");
        html2md = h2m.default;
    }
}

export function FeedService(): Hono<{
    Bindings: Env;
    Variables: Variables;
}> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();

    // GET /feed - List feeds
    app.get('/', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const page = c.req.query('page');
        const limit = c.req.query('limit');
        const type = c.req.query('type');
        const languageQuery = c.req.query('language');
        const language = languageQuery === undefined ? undefined : parseArticleLanguage(languageQuery);

        if (languageQuery !== undefined && !language) {
            return c.text('Unsupported article language', 400);
        }

        if ((type === 'draft' || type === 'unlisted') && !admin) {
            return c.text('Permission denied', 403);
        }

        const page_num = (page ? parseInt(page) > 0 ? parseInt(page) : 1 : 1) - 1;
        const limit_num = limit ? parseInt(limit) > 50 ? 50 : parseInt(limit) : 20;
        const cacheKey = `feeds_${type}_${language || 'all'}_${page_num}_${limit_num}`;
        const cached = await profileAsync(c, 'feed_list_cache_get', () => cache.get(cacheKey));

        if (cached) {
            const cachedData = cached as any;
            const dataWithVectorStatus = await profileAsync(c, 'feed_list_cached_vector_status', () => attachVectorizedStatus(db, Array.isArray(cachedData.data) ? cachedData.data : []));
            return c.json({ ...cachedData, data: dataWithVectorStatus });
        }

        const visibilityWhere = type === 'draft'
            ? eq(feeds.draft, 1)
            : type === 'unlisted'
                ? and(eq(feeds.draft, 0), eq(feeds.listed, 0))
                : and(eq(feeds.draft, 0), eq(feeds.listed, 1));
        const where = language ? and(visibilityWhere, eq(feeds.language, language)) : visibilityWhere;

        const size = await profileAsync(c, 'feed_list_count', () => db.select({ count: count() }).from(feeds).where(where));

        if (size[0].count === 0) {
            return c.json({ size: 0, data: [], hasNext: false });
        }

        const feed_list = (await profileAsync(c, 'feed_list_db', () => db.query.feeds.findMany({
            where: where,
            columns: admin ? undefined : { draft: false, listed: false },
            with: {
                hashtags: {
                    columns: {},
                    with: {
                        hashtag: { columns: { id: true, name: true } }
                    }
                },
                user: { columns: { id: true, username: true, avatar: true } }
            },
            orderBy: [desc(feeds.top), desc(feeds.createdAt), desc(feeds.updatedAt)],
            offset: page_num * limit_num,
            limit: limit_num + 1,
        }))).map(({ content, hashtags, summary, ...other }: any) => {
            const avatar = extractImageWithMetadata(content);
            const plainText = stripMarkdown(content);
            return {
                summary: summary.length > 0 ? summary : plainText.length > 100 ? plainText.slice(0, 100) : plainText,
                hashtags: hashtags.map(({ hashtag }: any) => hashtag),
                avatar,
                ...other
            };
        });

        let hasNext = false;
        if (feed_list.length === limit_num + 1) {
            feed_list.pop();
            hasNext = true;
        }

        const data = { size: size[0].count, data: feed_list, hasNext };

        if (type === undefined || type === 'normal' || type === '') {
            await profileAsync(c, 'feed_list_cache_set', () => cache.set(cacheKey, data));
        }

        const dataWithVectorStatus = await profileAsync(c, 'feed_list_vector_status', () => attachVectorizedStatus(db, data.data));
        return c.json({ ...data, data: dataWithVectorStatus });
    });

    // GET /feed/translation-candidates - List articles eligible as a translation source
    app.get('/translation-candidates', async (c) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const languageQuery = c.req.query('language');
        const language = languageQuery === undefined ? undefined : parseArticleLanguage(languageQuery);
        const excludedId = c.req.query('exclude');
        const exclude = excludedId === undefined ? undefined : parseFeedId(excludedId);

        if (!admin) {
            return c.text('Permission denied', 403);
        }
        if (languageQuery !== undefined && !language) {
            return c.text('Unsupported article language', 400);
        }
        if (excludedId !== undefined && exclude === null) {
            return c.text('Invalid article ID', 400);
        }

        const conditions: SQL[] = [];
        if (language) {
            conditions.push(eq(feeds.language, language));
        }
        if (typeof exclude === "number") {
            conditions.push(ne(feeds.id, exclude));
        }

        const candidates = await profileAsync(c, 'feed_translation_candidates', () => db.query.feeds.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            columns: {
                id: true,
                alias: true,
                title: true,
                language: true,
                translationGroup: true,
            },
            orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
            limit: 100,
        }));

        return c.json(candidates);
    });
    // GET /feed/timeline
    app.get('/timeline', async (c) => {
        const db = c.get('db');
        const languageQuery = c.req.query('language');
        const language = languageQuery === undefined ? undefined : parseArticleLanguage(languageQuery);
        let where = and(eq(feeds.draft, 0), eq(feeds.listed, 1));
        if (language) {
            where = and(where, eq(feeds.language, language));
        }

        return c.json(await profileAsync(c, 'feed_timeline_db', () => db.query.feeds.findMany({
            where: where,
            columns: { id: true, alias: true, title: true, createdAt: true },
            orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
        })));
    });


    // POST /feed - Create feed
    app.post('/', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const serverConfig = c.get('serverConfig');
        const env = c.get('env');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const body = await profileAsync(c, 'feed_create_parse', () => c.req.json());
        const { title, alias, listed, content, summary, draft, tags, createdAt } = body;
        const language = body.language === undefined ? "en" : parseArticleLanguage(body.language);
        const parsedTranslationOf = parseTranslationOf(body.translationOf);

        if (!admin) {
            return c.text('Permission denied', 403);
        }

        if (!title) {
            return c.text('Title is required', 400);
        }
        if (!content) {
            return c.text('Content is required', 400);
        }
        if (!language) {
            return c.text('Unsupported article language', 400);
        }
        if (body.translationOf !== undefined && parsedTranslationOf === undefined) {
            return c.text('Invalid translation article ID', 400);
        }

       const exist = await profileAsync(c, 'feed_create_existing', () => db.query.feeds.findFirst({
            where: eq(feeds.content, content)
       }));

        if (exist) {
            return c.text('Content already exists', 400);
        }

        const date = createdAt ? new Date(createdAt) : new Date();

        if (!uid) {
            return c.text('User ID is required', 400);
        }

        const translation = await profileAsync(c, 'feed_create_translation_group', () =>
            resolveTranslationGroup(db, language, parsedTranslationOf ?? null),
        );
        if ('error' in translation) {
            return c.text(translation.error, 400);
        }

        const result = await profileAsync(c, 'feed_create_insert', () => db.insert(feeds).values({
            title,
            content,
            summary,
            ai_summary: "",
            ai_summary_status: "idle",
            ai_summary_error: "",
            uid,
            alias,
            language,
            translationGroup: translation.group,
            listed: listed ? 1 : 0,
            draft: draft ? 1 : 0,
            createdAt: date,
            updatedAt: date
        }).returning({ insertedId: feeds.id }));

        await profileAsync(c, 'feed_create_tags', () => bindTagToPost(db, result[0].insertedId, tags));
        await profileAsync(c, 'feed_create_ai_queue', () => syncFeedAISummaryQueueState(db, serverConfig, env, result[0].insertedId, {
            draft: Boolean(draft),
            updatedAt: date,
            resetSummary: true,
        }));
        await profileAsync(c, 'feed_create_cache_invalidate', async () => {
            await cache.deletePrefix('feeds_');
            await cache.deletePrefix('feed_');
            await cache.deletePrefix('search_');
        });

        if (!draft) {
            queueArticleVectorizeWorkflow(c, result[0].insertedId);
        }

        if (env.SEO_WORKFLOW && listed && !draft) {
            const baseUrl = new URL(c.req.url).origin;
            const urlPath = articlePath(result[0].insertedId, alias || null, language);
            c.executionCtx.waitUntil(
                env.SEO_WORKFLOW.create({ params: { feedId: result[0].insertedId, urlPath, baseUrl } }).catch(console.error)
            );
        }

        if (result.length === 0) {
            return c.text('Failed to insert', 500);
        } else {
            return c.json(result[0]);
        }
    });

    // GET /feed/:id
    app.get('/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const clientConfig = c.get('clientConfig');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');
        const languageQuery = c.req.query('language');
        const language = languageQuery === undefined ? undefined : parseArticleLanguage(languageQuery);
        
        const id_num = parseFeedId(id);
        const cacheKey = id_num === null 
            ? language ? `feed_alias_${id}_${language}` : `feed_alias_${id}`
            : `feed_id_${id_num}`;
            
        const where = id_num === null ? eq(feeds.alias, id) : eq(feeds.id, id_num);

        const feed = await profileAsync(c, 'feed_detail_cache_db', () => cache.getOrSet(cacheKey, async () => {
            const queryOptions = {
                with: {
                    hashtags: {
                        columns: {},
                        with: {
                            hashtag: { columns: { id: true, name: true } }
                        }
                    },
                    user: { columns: { id: true, username: true, avatar: true } }
                }
            };

            if (id_num === null && language) {
                const specificFeed = await db.query.feeds.findFirst({
                    where: and(eq(feeds.alias, id), eq(feeds.language, language)),
                    ...queryOptions
                });
                if (specificFeed) return specificFeed;
            }
            
            return db.query.feeds.findFirst({
                where,
                ...queryOptions
            });
        }));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.draft && feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        const translationGroup = feed.translationGroup;
        const translationsPromise = !translationGroup
            ? Promise.resolve([])
            : profileAsync(c, 'feed_detail_translations', () => db.query.feeds.findMany({
                where: and(
                    eq(feeds.translationGroup, translationGroup),
                    ne(feeds.id, feed.id),
                    eq(feeds.draft, 0),
                    eq(feeds.listed, 1),
                ),
                columns: { id: true, alias: true, title: true, language: true },
                orderBy: [asc(feeds.language)],
            }));
        const vectorizedPromise = profileAsync(c, 'feed_detail_vector_status', () => getFeedVectorized(db, feed.id));
        const enableVisitPromise = profileAsync(c, 'feed_detail_counter_flag', () => clientConfig.getOrDefault('counter.enabled', true));
        const statsPromise = enableVisitPromise.then((enabled) => enabled
            ? profileAsync(c, 'feed_detail_stats_lookup', () => db.query.visitStats.findFirst({
                where: eq(visitStats.feedId, feed.id),
                columns: { pv: true, hllData: true },
            }).then((row) => row ?? null))
            : null);

        const [translations, vectorized, enableVisit, stats] = await Promise.all([
            translationsPromise,
            vectorizedPromise,
            enableVisitPromise,
            statsPromise,
        ]);

        const { hashtags, ...other } = feed;
        const hashtags_flatten = hashtags.map((f: any) => f.hashtag);
        let pv = 0;
        let uv = 0;

        if (enableVisit) {
            const visitorKey = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || "UNK";
            const nextStats = buildNextVisitStats(stats, visitorKey);
            pv = nextStats.pv;
            uv = nextStats.uv;
            scheduleFeedVisitPersistence(c, db, feed.id, visitorKey, stats);
        }

        return c.json({ ...other, hashtags: hashtags_flatten, translations, pv, uv, vectorized });
    });

    // GET /feed/adjacent/:id
    app.get("/adjacent/:id", async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const id = c.req.param('id');
        const languageQuery = c.req.query('language');
        const language = languageQuery === undefined ? undefined : parseArticleLanguage(languageQuery);
        let id_num = parseFeedId(id);

        if (languageQuery !== undefined && !language) {
            return c.text('Unsupported article language', 400);
        }

        if (id_num === null) {
            const aliasWhere = language
                ? and(eq(feeds.alias, id), eq(feeds.language, language))
                : eq(feeds.alias, id);
            const aliasRecord = await profileAsync(c, 'feed_adjacent_alias_lookup', () => db.select({ id: feeds.id }).from(feeds).where(aliasWhere));
            if (aliasRecord.length === 0) {
                return c.text("Not found", 404);
            }
            id_num = aliasRecord[0].id;
        }

        const feed = await profileAsync(c, 'feed_adjacent_current', () => db.query.feeds.findFirst({
            where: eq(feeds.id, id_num),
            columns: { createdAt: true, language: true },
        }));

        if (!feed) {
            return c.text("Not found", 404);
        }

        const created_at = feed.createdAt;
        const current_language = feed.language;

        function formatAndCacheData(feed: any, feedDirection: "previous_feed" | "next_feed") {
            if (feed) {
                const hashtags_flatten = feed.hashtags.map((f: any) => f.hashtag);
                const plainText = stripMarkdown(feed.content);
                const summary = feed.summary.length > 0
                    ? feed.summary
                    : plainText.length > 50 ? plainText.slice(0, 50) : plainText;
                const cacheKey = `${feed.id}_${feedDirection}_${id_num}`;
                const cacheData = {
                    id: feed.id,
                    alias: feed.alias,
                    title: feed.title,
                    summary: summary,
                    hashtags: hashtags_flatten,
                    createdAt: feed.createdAt,
                    updatedAt: feed.updatedAt,
                    language: feed.language,
                };
                cache.set(cacheKey, cacheData);
                return cacheData;
            }
            return null;
        }

        const getPreviousFeed = async () => {
            const previousFeedCached = await profileAsync(c, 'feed_adjacent_prev_cache', () => cache.getBySuffix(`previous_feed_${id_num}`));
            if (previousFeedCached && previousFeedCached.length > 0 && previousFeedCached[0]?.language === current_language) {
                return previousFeedCached[0];
            } else {
                const tempPreviousFeed = await profileAsync(c, 'feed_adjacent_prev_db', () => db.query.feeds.findFirst({
                    where: and(and(eq(feeds.draft, 0), eq(feeds.listed, 1)), and(lt(feeds.createdAt, created_at), eq(feeds.language, current_language))),
                    orderBy: [desc(feeds.createdAt)],
                    with: {
                        hashtags: {
                            columns: {},
                            with: { hashtag: { columns: { id: true, name: true } } }
                        },
                        user: { columns: { id: true, username: true, avatar: true } }
                    },
                }));
                return formatAndCacheData(tempPreviousFeed, "previous_feed");
            }
        };

        const getNextFeed = async () => {
            const nextFeedCached = await profileAsync(c, 'feed_adjacent_next_cache', () => cache.getBySuffix(`next_feed_${id_num}`));
            if (nextFeedCached && nextFeedCached.length > 0 && nextFeedCached[0]?.language === current_language) {
                return nextFeedCached[0];
            } else {
                const tempNextFeed = await profileAsync(c, 'feed_adjacent_next_db', () => db.query.feeds.findFirst({
                    where: and(and(eq(feeds.draft, 0), eq(feeds.listed, 1)), and(gt(feeds.createdAt, created_at), eq(feeds.language, current_language))),
                    orderBy: [asc(feeds.createdAt)],
                    with: {
                        hashtags: {
                            columns: {},
                            with: { hashtag: { columns: { id: true, name: true } } }
                        },
                        user: { columns: { id: true, username: true, avatar: true } }
                    },
                }));
                return formatAndCacheData(tempNextFeed, "next_feed");
            }
        };

        const [previousFeed, nextFeed] = await Promise.all([getPreviousFeed(), getNextFeed()]);
        return c.json({ previousFeed, nextFeed });
    });

    // POST /feed/:id - Update feed
    app.post('/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const serverConfig = c.get('serverConfig');
        const env = c.get('env');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');
        const body = await profileAsync(c, 'feed_update_parse', () => c.req.json());
        const { title, listed, content, summary, alias, draft, top, tags, createdAt } = body;

        const id_num = parseInt(id);
        const feed = await profileAsync(c, 'feed_update_lookup', () => db.query.feeds.findFirst({ where: eq(feeds.id, id_num) }));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        const language = body.language === undefined
            ? parseArticleLanguage(feed.language) || "en"
            : parseArticleLanguage(body.language);
        const parsedTranslationOf = parseTranslationOf(body.translationOf);
        if (!language) {
            return c.text('Unsupported article language', 400);
        }
        if (body.translationOf !== undefined && parsedTranslationOf === undefined) {
            return c.text('Invalid translation article ID', 400);
        }

        let translationGroup = feed.translationGroup;
        if (parsedTranslationOf !== undefined) {
            const translation = await profileAsync(c, 'feed_update_translation_group', () =>
                resolveTranslationGroup(db, language, parsedTranslationOf, feed.id),
            );
            if ('error' in translation) {
                return c.text(translation.error, 400);
            }
            translationGroup = translation.group;
        } else {
            const existingTranslationGroup = feed.translationGroup;
            if (language !== feed.language && existingTranslationGroup) {
                const existingTranslation = await profileAsync(c, 'feed_update_language_conflict', () => db.query.feeds.findFirst({
                    where: and(
                        eq(feeds.translationGroup, existingTranslationGroup),
                        eq(feeds.language, language),
                        ne(feeds.id, feed.id),
                    ),
                    columns: { id: true },
                }));
                if (existingTranslation) {
                    return c.text('This translation group already has an article in the selected language', 400);
                }
            }
        }

        const contentChanged = content && content !== feed.content;
        const languageChanged = language !== feed.language;
        const isDraft = draft !== undefined ? draft : (feed.draft === 1);
        const isListed = listed !== undefined ? listed : (feed.listed === 1);
        const shouldQueueAISummary = ((contentChanged || languageChanged) && !isDraft) || (!isDraft && feed.draft === 1 && !feed.ai_summary);
        const updateTime = new Date();

        await profileAsync(c, 'feed_update_db', () => db.update(feeds).set({
            title,
            content,
            summary,
            ai_summary: shouldQueueAISummary ? "" : undefined,
            ai_summary_status: isDraft ? "idle" : undefined,
            ai_summary_error: shouldQueueAISummary || isDraft ? "" : undefined,
            alias,
            language,
            translationGroup,
            top,
            listed: isListed ? 1 : 0,
            draft: isDraft ? 1 : 0,
            createdAt: createdAt ? new Date(createdAt) : undefined,
            updatedAt: updateTime
        }).where(eq(feeds.id, id_num)));

        if (tags) {
            await profileAsync(c, 'feed_update_tags', () => bindTagToPost(db, id_num, tags));
        }

        if (shouldQueueAISummary || isDraft) {
            await profileAsync(c, 'feed_update_ai_queue', () => syncFeedAISummaryQueueState(db, serverConfig, env, id_num, {
                draft: Boolean(isDraft),
                updatedAt: updateTime,
                resetSummary: shouldQueueAISummary,
            }));
        }

        await profileAsync(c, 'feed_update_cache_invalidate', async () => {
            await clearFeedCache(cache, id_num, feed.alias, alias || null);
            await cache.deletePrefix('feed_');
            await cache.deletePrefix('search_');
        });

        queueArticleVectorizeWorkflow(c, id_num);

        if (env.SEO_WORKFLOW && isListed && !isDraft) {
            const baseUrl = new URL(c.req.url).origin;
            const urlPath = articlePath(id_num, alias || feed.alias || null, language);
            c.executionCtx.waitUntil(
                env.SEO_WORKFLOW.create({ params: { feedId: id_num, urlPath, baseUrl } }).catch(console.error)
            );
        }

        return c.text('Updated');
    });

    // POST /feed/top/:id
    app.post('/top/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');
        const body = await profileAsync(c, 'feed_top_parse', () => c.req.json());
        const { top } = body;

        const id_num = parseInt(id);
        const feed = await profileAsync(c, 'feed_top_lookup', () => db.query.feeds.findFirst({ where: eq(feeds.id, id_num) }));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        await profileAsync(c, 'feed_top_db', () => db.update(feeds).set({ top }).where(eq(feeds.id, feed.id)));
        await profileAsync(c, 'feed_top_cache_invalidate', () => clearFeedCache(cache, feed.id, feed.alias, feed.alias));
        return c.text('Updated');
    });

    // DELETE /feed/:id
    app.delete('/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');

        const id_num = parseInt(id);
        const feed = await profileAsync(c, 'feed_delete_lookup', () => db.query.feeds.findFirst({ where: eq(feeds.id, id_num) }));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        if (feed.translationGroup === feed.id) {
            const replacement = await profileAsync(c, 'feed_delete_translation_replacement', () => db.query.feeds.findFirst({
                where: and(eq(feeds.translationGroup, feed.id), ne(feeds.id, feed.id)),
                columns: { id: true },
                orderBy: [asc(feeds.id)],
            }));
            if (replacement) {
                await profileAsync(c, 'feed_delete_translation_relink', () => db.update(feeds)
                    .set({ translationGroup: replacement.id })
                    .where(eq(feeds.translationGroup, feed.id)));
            }
        }

        const vectorIndexState = await profileAsync(c, 'feed_delete_vector_state_lookup', () => db.query.feedVectorIndexes.findFirst({
            where: eq(feedVectorIndexes.feedId, id_num),
            columns: { chunkCount: true },
        }));

        await profileAsync(c, 'feed_delete_db', () => db.delete(feeds).where(eq(feeds.id, id_num)));
        await profileAsync(c, 'feed_delete_cache_invalidate', async () => {
            await clearFeedCache(cache, id_num, feed.alias, null);
            await cache.deletePrefix('feed_');
            await cache.deletePrefix('search_');
        });

        queueArticleVectorizeWorkflow(c, id_num, { isDelete: true, chunkCount: vectorIndexState?.chunkCount });

        const env = c.get('env');
        if (env.SEO_WORKFLOW) {
            const baseUrl = new URL(c.req.url).origin;
            const urlPath = articlePath(id_num, feed.alias, feed.language);
            c.executionCtx.waitUntil(
                env.SEO_WORKFLOW.create({ params: { feedId: id_num, urlPath, baseUrl, isDelete: true } }).catch(console.error)
            );
        }

        return c.text('Deleted');
    });
    return app;
}

async function findSemanticFeedIds(env: Env, keyword: string, language: ArticleLanguage | null, topK: number, minScore: number) {
    if (!env.AI || !env.ARTICLE_VECTORIZE) {
        return [] as number[];
    }

    try {
        const embeddings = extractEmbeddingVectors(await env.AI.run(ARTICLE_EMBEDDING_MODEL, { text: [keyword] }));
        const queryVector = embeddings[0];
        if (!queryVector) {
            return [];
        }

        const result = await env.ARTICLE_VECTORIZE.query(queryVector, {
            topK,
            returnMetadata: "all",
            filter: language ? { language } : undefined,
        });

        const ids = new Set<number>();
        for (const match of result?.matches || []) {
            if (typeof match.score !== "number" || match.score < minScore) {
                continue;
            }

            const metadataFeedId = match.metadata?.feedId;
            const parsedId = typeof metadataFeedId === "number"
                ? metadataFeedId
                : typeof metadataFeedId === "string"
                    ? parseInt(metadataFeedId)
                    : Number.NaN;

            if (Number.isSafeInteger(parsedId) && parsedId > 0) {
                ids.add(parsedId);
            }
        }

        return Array.from(ids);
    } catch (error) {
        if (!isWorkersAIRateLimitError(error)) {
            console.error("[Search] Vector search failed:", error);
        }
        return [];
    }
}

function mapFeedSearchItem({ content, hashtags, summary, ...other }: any) {
    const plainText = stripMarkdown(content);
    return {
        summary: summary.length > 0 ? summary : plainText.length > 100 ? plainText.slice(0, 100) : plainText,
        hashtags: hashtags.map(({ hashtag }: any) => hashtag),
        ...other
    };
}

async function loadFeedsByIds(db: DB, ids: number[], admin: boolean, language: ArticleLanguage | null) {
    if (ids.length === 0) {
        return [] as any[];
    }

    let whereClause = inArray(feeds.id, ids) as any;
    if (language) {
        whereClause = and(whereClause, eq(feeds.language, language));
    }
    if (!admin) {
        whereClause = and(whereClause, eq(feeds.draft, 0));
    }

    const rows = await db.query.feeds.findMany({
        where: whereClause,
        columns: admin ? undefined : { draft: false, listed: false },
        with: {
            hashtags: {
                columns: {},
                with: { hashtag: { columns: { id: true, name: true } } }
            },
            user: { columns: { id: true, username: true, avatar: true } }
        },
    });

    const byId = new Map(rows.map((row: any) => [row.id, row]));
    return ids.map((id) => byId.get(id)).filter(Boolean).map(mapFeedSearchItem);
}

function buildKeywordSearchTerms(keyword: string) {
    const trimmed = keyword.trim();
    const terms = new Set<string>();

    if (trimmed.length === 0) {
        return [] as string[];
    }

    terms.add(trimmed);

    const compacted = trimmed.replace(/[-_\s]+/g, "");
    if (compacted.length > 0) {
        terms.add(compacted);
    }

    const hyphenated = trimmed.replace(/[_\s]+/g, "-");
    if (hyphenated.length > 0) {
        terms.add(hyphenated);
    }

    const ecommerceHyphenated = trimmed.replace(/e[-_\s]?commerce/gi, "e-commerce");
    if (ecommerceHyphenated.length > 0) {
        terms.add(ecommerceHyphenated);
    }

    const ecommerceCompacted = trimmed.replace(/e[-_\s]+commerce/gi, "ecommerce");
    if (ecommerceCompacted.length > 0) {
        terms.add(ecommerceCompacted);
    }

    return Array.from(terms);
}

function buildKeywordSearchWhere(keyword: string, language: ArticleLanguage | null) {
    const conditions = buildKeywordSearchTerms(keyword).flatMap((term) => {
        const searchKeyword = `%${term}%`;
        return [
            like(feeds.title, searchKeyword),
            like(feeds.content, searchKeyword),
            like(feeds.summary, searchKeyword),
            like(feeds.alias, searchKeyword),
        ];
    });

    let whereClause = or(...conditions) as any;

    if (language) {
        whereClause = and(whereClause, eq(feeds.language, language));
    }

    return whereClause;
}

export function SearchService(): Hono<{
    Bindings: Env;
    Variables: Variables;
}> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();

    // GET /search/:keyword
    app.get('/:keyword', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const env = c.get('env');
        const serverConfig = c.get('serverConfig');
        const page = c.req.query('page');
        const limit = c.req.query('limit');
        let keyword = c.req.param('keyword');

        keyword = decodeURI(keyword).trim();
        const page_num = (page ? parseInt(page) > 0 ? parseInt(page) : 1 : 1) - 1;
        const limit_num = limit ? parseInt(limit) > 50 ? 50 : parseInt(limit) : 20;

        if (keyword.length === 0) {
            return c.json({ size: 0, data: [], hasNext: false });
        }

        const languageQuery = c.req.query('language');
        const language = languageQuery === undefined ? null : parseArticleLanguage(languageQuery);

        const vectorTopK = Math.max(20, Math.min(50, (page_num + 1) * limit_num + 10));
        const vectorScoreThreshold = await profileAsync(c, 'feed_search_vector_score_threshold', () => getVectorScoreThreshold(serverConfig));
        const semanticFeedIds = await profileAsync(c, 'feed_search_vector', () => findSemanticFeedIds(env, keyword, language, vectorTopK, vectorScoreThreshold));
        const semanticFeeds = await profileAsync(c, 'feed_search_vector_db', () => loadFeedsByIds(db, semanticFeedIds, admin, language));

        const cacheKey = `search_${admin ? "admin" : "public"}_${keyword}_${language || "all"}`;
        const whereClause = buildKeywordSearchWhere(keyword, language);
        const keywordFeeds = (await profileAsync(c, 'feed_search_cache_db', () => cache.getOrSet(cacheKey, () => db.query.feeds.findMany({
            where: admin ? whereClause : and(whereClause, eq(feeds.draft, 0)),
            columns: admin ? undefined : { draft: false, listed: false },
            with: {
                hashtags: {
                    columns: {},
                    with: { hashtag: { columns: { id: true, name: true } } }
                },
                user: { columns: { id: true, username: true, avatar: true } }
            },
            orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
        })))).map(mapFeedSearchItem);

        const seen = new Set<number>();
        const feed_list = [...keywordFeeds, ...semanticFeeds].filter((feed: any) => {
            if (seen.has(feed.id)) {
                return false;
            }
            seen.add(feed.id);
            return true;
        });
        const feedsWithVectorStatus = await profileAsync(c, 'feed_search_vector_status', () => attachVectorizedStatus(db, feed_list));

        if (feedsWithVectorStatus.length <= page_num * limit_num) {
            return c.json({ size: feedsWithVectorStatus.length, data: [], hasNext: false });
        } else if (feedsWithVectorStatus.length <= page_num * limit_num + limit_num) {
            return c.json({ size: feedsWithVectorStatus.length, data: feedsWithVectorStatus.slice(page_num * limit_num), hasNext: false });
        } else {
            return c.json({
                size: feedsWithVectorStatus.length,
                data: feedsWithVectorStatus.slice(page_num * limit_num, page_num * limit_num + limit_num),
                hasNext: true
            });
        }
    });
    return app;
}


export function WordPressService(): Hono<{
    Bindings: Env;
    Variables: Variables;
}> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();

    // POST /wp - WordPress import
    app.post('/', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const body = await profileAsync(c, 'wp_import_parse', () => c.req.parseBody());
        const data = body.data as File;

        if (!admin) {
            return c.text('Permission denied', 403);
        }

        if (!data) {
            return c.text('Data is required', 400);
        }

        // Initialize WordPress import modules lazily
        await profileAsync(c, 'wp_import_modules', () => initWPModules());

        const xml = await profileAsync(c, 'wp_import_read', () => data.text());
        const parser = new XMLParser();
        const result = await profileAsync(c, 'wp_import_xml_parse', () => parser.parse(xml));
        const items = result.rss.channel.item;

        if (!items) {
            return c.text('No items found', 404);
        }

        const feedItems: FeedItem[] = items?.map((item: any) => {
            const createdAt = new Date(item?.['wp:post_date']);
            const updatedAt = new Date(item?.['wp:post_modified']);
            const draft = item?.['wp:status'] !== 'publish';
            const contentHtml = item?.['content:encoded'];
            const content = html2md(contentHtml);
            const summary = content.length > 100 ? content.slice(0, 100) : content;
            let tags = item?.['category'];

            if (tags && Array.isArray(tags)) {
                tags = tags.map((tag: any) => tag + '');
            } else if (tags && typeof tags === 'string') {
                tags = [tags];
            }

            return {
                title: item.title,
                summary,
                content,
                draft,
                createdAt,
                updatedAt,
                tags
            };
        });

        let success = 0;
        let skipped = 0;
        let skippedList: { title: string, reason: string }[] = [];

        for (const item of feedItems) {
            if (!item.content) {
                skippedList.push({ title: item.title, reason: "no content" });
                skipped++;
                continue;
            }

            const exist = await profileAsync(c, 'wp_import_existing', () => db.query.feeds.findFirst({ where: eq(feeds.content, item.content) }));
            if (exist) {
                skippedList.push({ title: item.title, reason: "content exists" });
                skipped++;
                continue;
            }

            const result = await profileAsync(c, 'wp_import_insert', () => db.insert(feeds).values({
                title: item.title,
                content: item.content,
                summary: item.summary,
                uid: 1,
                listed: 1,
                draft: item.draft ? 1 : 0,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            }).returning({ insertedId: feeds.id }));

            if (item.tags) {
                const tags = item.tags;
                await profileAsync(c, 'wp_import_tags', () => bindTagToPost(db, result[0].insertedId, tags));
            }
            success++;
        }

        await profileAsync(c, 'wp_import_cache_invalidate', () => cache.deletePrefix('feeds_'));
        return c.json({ success, skipped, skippedList });
    });
    return app;
}

type FeedItem = {
    title: string;
    summary: string;
    content: string;
    draft: boolean;
    createdAt: Date;
    updatedAt: Date;
    tags?: string[];
}
