import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SEARCH_VECTOR_SCORE_THRESHOLD_KEY } from "@rin/config";
import { FeedService, SearchService } from '../feed';
import { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { setupTestApp, createTestUser, cleanupTestDB } from '../../../tests/fixtures';
import type { Database } from 'bun:sqlite';
import type { TestCacheImpl } from '../../../tests/fixtures';

describe('FeedService', () => {
    let db: any;
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;
    let cache: TestCacheImpl;
    let serverConfig: TestCacheImpl;
    let clientConfig: TestCacheImpl;

    beforeEach(async () => {
        const ctx = await setupTestApp(FeedService);
        db = ctx.db;
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;
        cache = ctx.cache;
        serverConfig = ctx.serverConfig;
        clientConfig = ctx.clientConfig;

        app.route('/search', SearchService());
        
        // Create test user
        await createTestUser(sqlite);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });



    describe('GET / - List feeds', () => {
        it('should list published feeds', async () => {
            // Create feeds via API
            const res1 = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed 1',
                    content: 'Content 1',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(res1.status).toBe(200);
            
            const res2 = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed 2',
                    content: 'Content 2',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(res2.status).toBe(200);
            
            const listRes = await app.request('/?page=1&limit=10', { method: 'GET' }, env);
            
            expect(listRes.status).toBe(200);
            const data = await listRes.json() as any;
            expect(data.size).toBe(2);
            expect(data.data).toBeArray();
        });

        it('should return empty list when no feeds exist', async () => {
            const res = await app.request('/', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.size).toBe(0);
            expect(data.data).toEqual([]);
        });
        it('should cache public feed lists in the edge cache', async () => {
            await clientConfig.set('cache.enabled', false);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Cached List Feed',
                    content: 'Cached List Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(createRes.status).toBe(200);
            const cacheStore = new Map<string, Response>();
            const originalCaches = (globalThis as any).caches;
            const waitUntilPromises: Promise<unknown>[] = [];
            const executionCtx = {
                waitUntil: (promise: Promise<unknown>) => {
                    waitUntilPromises.push(Promise.resolve(promise));
                },
                passThroughOnException: () => {},
            } as unknown as ExecutionContext;

            (globalThis as any).caches = {
                default: {
                    match: async (request: Request) => cacheStore.get(request.url)?.clone(),
                    put: async (request: Request, response: Response) => {
                        cacheStore.set(request.url, response.clone());
                    },
                },
            };

            try {
                const firstRes = await app.request('/?page=1&limit=5&type=normal&language=en', { method: 'GET' }, env, executionCtx);
                expect(firstRes.status).toBe(200);
                expect(firstRes.headers.get('X-Rin-Feed-List-Cache')).toBe('MISS');
                expect(firstRes.headers.get('Cache-Control')).toBe('no-store');
                expect(waitUntilPromises).toHaveLength(1);
                await Promise.all(waitUntilPromises);

                waitUntilPromises.length = 0;
                const secondRes = await app.request('/?language=en&type=normal&limit=5&page=1', { method: 'GET' }, env, executionCtx);
                expect(secondRes.status).toBe(200);
                expect(secondRes.headers.get('X-Rin-Feed-List-Cache')).toBe('HIT');
                expect(secondRes.headers.get('Cache-Control')).toBe('no-store');
                expect(waitUntilPromises).toHaveLength(0);

                const secondData = await secondRes.json() as any;
                expect(secondData.data.map((feed: any) => feed.title)).toContain('Cached List Feed');
            } finally {
                if (originalCaches === undefined) {
                    delete (globalThis as any).caches;
                } else {
                    (globalThis as any).caches = originalCaches;
                }
            }
        });
        it('should filter feeds by language and expose linked translations', async () => {
            const englishResponse = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'English article',
                    content: 'English content',
                    language: 'en',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(englishResponse.status).toBe(200);
            const english = await englishResponse.json() as { insertedId: number };

            const chineseResponse = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: '中文文章',
                    content: '中文内容',
                    language: 'zh-CN',
                    translationOf: english.insertedId,
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(chineseResponse.status).toBe(200);
            const chinese = await chineseResponse.json() as { insertedId: number };

            const detailResponse = await app.request(`/${english.insertedId}`, { method: 'GET' }, env);
            expect(detailResponse.status).toBe(200);
            const detail = await detailResponse.json() as any;
            expect(detail.language).toBe('en');
            expect(detail.translations).toEqual([
                expect.objectContaining({ id: chinese.insertedId, language: 'zh-CN' }),
            ]);

            const listResponse = await app.request('/?language=zh-CN', { method: 'GET' }, env);
            expect(listResponse.status).toBe(200);
            const list = await listResponse.json() as any;
            expect(list.size).toBe(1);
            expect(list.data[0].id).toBe(chinese.insertedId);
            expect(list.data[0].language).toBe('zh-CN');
        });

        it('should include language in adjacent feeds and ignore stale adjacent cache entries', async () => {
            sqlite.run(
                `INSERT INTO feeds (id, alias, title, summary, content, language, listed, draft, uid, created_at, updated_at) VALUES
                    (101, 'prev-zh', '上一篇', '', 'Previous Chinese content', 'zh-CN', 1, 0, 1, 1000, 1000),
                    (102, 'middle-zh', '当前篇', '', 'Middle Chinese content', 'zh-CN', 1, 0, 1, 2000, 2000),
                    (103, 'next-zh', '下一篇', '', 'Next Chinese content', 'zh-CN', 1, 0, 1, 3000, 3000),
                    (104, 'next-en', 'Next EN', '', 'Next English content', 'en', 1, 0, 1, 4000, 4000)`
            );

            const originalGetBySuffix = cache.getBySuffix.bind(cache);
            cache.getBySuffix = async (suffix: string) => {
                if (suffix === 'previous_feed_102') {
                    return [{ id: 999, alias: 'stale-prev', title: 'Stale previous' }];
                }
                return originalGetBySuffix(suffix);
            };

            const response = await app.request('/adjacent/102', { method: 'GET' }, env);
            expect(response.status).toBe(200);

            const data = await response.json() as any;
            expect(data.previousFeed).toEqual(expect.objectContaining({
                id: 101,
                alias: 'prev-zh',
                language: 'zh-CN',
            }));
            expect(data.nextFeed).toEqual(expect.objectContaining({
                id: 103,
                alias: 'next-zh',
                language: 'zh-CN',
            }));
        });

        it('should filter drafts for non-admin users', async () => {
            // Create a draft feed
            await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Draft Feed',
                    content: 'Draft Content',
                    listed: true,
                    draft: true,
                    tags: [],
                }),
            }, env);
            
            const res = await app.request('/?type=draft', { method: 'GET' }, env);
            
            expect(res.status).toBe(403);
        });

        it('should allow admin to view drafts', async () => {
            // Create a draft feed
            await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Draft Feed',
                    content: 'Draft Content',
                    listed: true,
                    draft: true,
                    tags: [],
                }),
            }, env);
            
            const res = await app.request('/?type=draft', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.size).toBe(1);
        });
    });

    describe('GET /:id - Get single feed', () => {
        it('should return feed by id', async () => {
            // Create a feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed',
                    content: 'Test Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            
            expect(getRes.status).toBe(200);
            const data = await getRes.json() as any;
            expect(data.title).toBe('Test Feed');
        });

        it('should cache public article content in the edge cache', async () => {
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Cached Feed',
                    alias: 'cached-feed',
                    content: 'Cached Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(createRes.status).toBe(200);
            const cacheStore = new Map<string, Response>();
            const originalCaches = (globalThis as any).caches;
            const waitUntilPromises: Promise<unknown>[] = [];
            const executionCtx = {
                waitUntil: (promise: Promise<unknown>) => {
                    waitUntilPromises.push(Promise.resolve(promise));
                },
                passThroughOnException: () => {},
            } as unknown as ExecutionContext;

            (globalThis as any).caches = {
                default: {
                    match: async (request: Request) => cacheStore.get(request.url)?.clone(),
                    put: async (request: Request, response: Response) => {
                        cacheStore.set(request.url, response.clone());
                    },
                },
            };

            try {
                const firstRes = await app.request('/cached-feed', { method: 'GET' }, env, executionCtx);
                expect(firstRes.status).toBe(200);
                expect(firstRes.headers.get('X-Rin-Article-Cache')).toBe('MISS');
                expect(firstRes.headers.get('Cache-Control')).toBe('no-store');
                expect(waitUntilPromises).toHaveLength(1);
                await Promise.all(waitUntilPromises);

                waitUntilPromises.length = 0;
                const secondRes = await app.request('/cached-feed', { method: 'GET' }, env, executionCtx);
                expect(secondRes.status).toBe(200);
                expect(secondRes.headers.get('X-Rin-Article-Cache')).toBe('HIT');
                expect(secondRes.headers.get('Cache-Control')).toBe('no-store');
                expect(waitUntilPromises).toHaveLength(0);
                expect(await secondRes.json() as any).toMatchObject({
                    title: 'Cached Feed',
                    content: 'Cached Content',
                    pv: 0,
                    uv: 0,
                });
            } finally {
                if (originalCaches === undefined) {
                    delete (globalThis as any).caches;
                } else {
                    (globalThis as any).caches = originalCaches;
                }
            }
        });
        it('should schedule visit persistence from the stats endpoint without blocking article content', async () => {
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Counter Feed',
                    content: 'Counter Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const waitUntilPromises: Promise<unknown>[] = [];
            const executionCtx = {
                waitUntil: (promise: Promise<unknown>) => {
                    waitUntilPromises.push(Promise.resolve(promise));
                },
                passThroughOnException: () => {},
            } as unknown as ExecutionContext;

            const detailRes = await app.request(
                `/${createData.insertedId}`,
                { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.10' } },
                env,
                executionCtx,
            );

            expect(detailRes.status).toBe(200);
            const detailData = await detailRes.json() as any;
            expect(detailData.pv).toBe(0);
            expect(detailData.uv).toBe(0);
            expect(waitUntilPromises).toHaveLength(0);

            const firstRes = await app.request(
                `/stats/${createData.insertedId}`,
                { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.10' } },
                env,
                executionCtx,
            );

            expect(firstRes.status).toBe(200);
            const firstData = await firstRes.json() as any;
            expect(firstData.pv).toBe(1);
            expect(firstData.uv).toBe(1);
            expect(waitUntilPromises).toHaveLength(1);

            await Promise.all(waitUntilPromises);
            const firstStats = sqlite.prepare('SELECT pv, hll_data FROM visit_stats WHERE feed_id = ?').get(createData.insertedId) as any;
            expect(firstStats.pv).toBe(1);
            expect(firstStats.hll_data).not.toBe('');
            expect((sqlite.prepare('SELECT COUNT(*) as count FROM visits WHERE feed_id = ?').get(createData.insertedId) as any).count).toBe(1);

            waitUntilPromises.length = 0;
            const secondRes = await app.request(
                `/stats/${createData.insertedId}`,
                { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.10' } },
                env,
                executionCtx,
            );

            expect(secondRes.status).toBe(200);
            const secondData = await secondRes.json() as any;
            expect(secondData.pv).toBe(2);
            expect(secondData.uv).toBe(1);
            expect(waitUntilPromises).toHaveLength(1);

            await Promise.all(waitUntilPromises);
            const secondStats = sqlite.prepare('SELECT pv FROM visit_stats WHERE feed_id = ?').get(createData.insertedId) as any;
            expect(secondStats.pv).toBe(2);
            expect((sqlite.prepare('SELECT COUNT(*) as count FROM visits WHERE feed_id = ?').get(createData.insertedId) as any).count).toBe(2);
        });

        it('should prefer a numeric feed id over another feed numeric alias', async () => {
            const firstRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Previous Feed',
                    alias: '2',
                    content: 'Previous Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(firstRes.status).toBe(200);

            const secondRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Target Feed',
                    content: 'Target Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(secondRes.status).toBe(200);
            const secondData = await secondRes.json() as any;

            const getRes = await app.request(`/${secondData.insertedId}`, { method: 'GET' }, env);

            expect(getRes.status).toBe(200);
            const data = await getRes.json() as any;
            expect(data.id).toBe(secondData.insertedId);
            expect(data.title).toBe('Target Feed');
            expect(data.content).toBe('Target Content');
        });

        it('should return feed by non-numeric alias', async () => {
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Alias Feed',
                    alias: 'custom-slug',
                    content: 'Alias Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(createRes.status).toBe(200);

            const getRes = await app.request('/custom-slug', { method: 'GET' }, env);

            expect(getRes.status).toBe(200);
            const data = await getRes.json() as any;
            expect(data.title).toBe('Alias Feed');
        });

        it('should return AI summary generation status for a queued feed', async () => {
            await serverConfig.set('ai_summary.enabled', 'true', false);
            await serverConfig.set('ai_summary.provider', 'worker-ai', false);
            await serverConfig.set('ai_summary.model', 'llama-3-8b', false);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Queued AI Feed',
                    content: 'Queued AI content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            const createData = await createRes.json() as any;
            const getRes = await app.request(`/${createData.insertedId}`, { method: 'GET' }, env);

            expect(getRes.status).toBe(200);
            const data = await getRes.json() as any;
            expect(data.ai_summary_status).toBe('pending');
            expect(data.ai_summary_error).toBe('');
        });

        it('should return 404 for non-existent feed', async () => {
            const res = await app.request('/9999', { method: 'GET' }, env);
            
            expect(res.status).toBe(404);
        });

        it('should bypass stale public cache when cache is disabled', async () => {
            await clientConfig.set('cache.enabled', false);
            await clientConfig.set('counter.enabled', false);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Fresh Feed',
                    content: 'Fresh Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            const createData = await createRes.json() as any;
            await cache.set(`feed_${createData.insertedId}`, {
                id: createData.insertedId,
                title: 'Stale Feed',
                content: 'stale',
                summary: '',
                ai_summary: '',
                ai_summary_status: 'idle',
                ai_summary_error: '',
                draft: 0,
                listed: 1,
                uid: 1,
                alias: null,
                hashtags: [],
                user: { id: 1, username: 'testuser', avatar: 'avatar.png' },
            });

            const getRes = await app.request(`/${createData.insertedId}`, { method: 'GET' }, env);
            const data = await getRes.json() as any;

            expect(data.title).toBe('Fresh Feed');
        });
    });

    describe('POST / - Create feed', () => {
        it('should create feed with admin permission', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'New Test Feed',
                    content: 'This is a new test feed content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.insertedId).toBeDefined();
        });

        it('should require admin permission', async () => {
            // Create app without admin permission
            const res = await app.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Test',
                    content: 'Test',
                    tags: [],
                    draft: false,
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(403);
        });

        it('should require title', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: 'Content without title',
                    tags: [],
                    draft: false,
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(400);
        });

        it('should require content', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test',
                    content: '',
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(400);
        });
    });

    describe('POST /:id - Update feed', () => {
        it('should update feed with admin permission', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Original Title',
                    content: 'Original Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const updateRes = await app.request(`/${feedId}`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Updated Title',
                    content: 'Updated content',
                    listed: true,
                }),
            }, env);

            expect(updateRes.status).toBe(200);
            
            // Verify update
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            const data = await getRes.json() as any;
            expect(data.title).toBe('Updated Title');
        });

        it('should return updated content through unchanged alias after edit', async () => {
            await clientConfig.set('counter.enabled', false);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Alias Title',
                    alias: 'alias-post',
                    content: 'Original alias content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;

            const cachedAliasRes = await app.request('/alias-post', { method: 'GET' }, env);
            expect(cachedAliasRes.status).toBe(200);
            expect(((await cachedAliasRes.json()) as any).content).toBe('Original alias content');

            const updateRes = await app.request(`/${feedId}`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Alias Title Updated',
                    alias: 'alias-post',
                    content: 'Updated alias content',
                    listed: true,
                }),
            }, env);

            expect(updateRes.status).toBe(200);

            const aliasRes = await app.request('/alias-post', { method: 'GET' }, env);
            expect(aliasRes.status).toBe(200);
            const aliasData = await aliasRes.json() as any;
            expect(aliasData.title).toBe('Alias Title Updated');
            expect(aliasData.content).toBe('Updated alias content');

            const idRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            expect(idRes.status).toBe(200);
            expect(((await idRes.json()) as any).content).toBe('Updated alias content');
        });

        it('should require admin permission to update', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Original',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const updateRes = await app.request(`/${feedId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'New Title',
                    listed: true,
                }),
            }, env);

            expect(updateRes.status).toBe(403);
        });
    });

    describe('DELETE /:id - Delete feed', () => {
        it('should delete feed with admin permission', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'To Delete',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const deleteRes = await app.request(`/${feedId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);

            expect(deleteRes.status).toBe(200);
            
            // Verify deletion
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            expect(getRes.status).toBe(404);
        });

        it('should require admin permission to delete', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const deleteRes = await app.request(`/${feedId}`, { method: 'DELETE' }, env);

            expect(deleteRes.status).toBe(403);
        });

        it('should return 404 for non-existent feed', async () => {
            const res = await app.request('/9999', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);

            expect(res.status).toBe(404);
        });
    });

    describe('Language Filtering Features', () => {
        it('should prioritize language when getting feed by shared alias', async () => {
            const englishResponse = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Alias EN', alias: 'shared-alias', content: 'English', language: 'en', listed: true, draft: false, tags: []
                })
            }, env);
            const english = await englishResponse.json() as { insertedId: number };

            await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Alias ZH', alias: 'shared-alias', content: 'Chinese', language: 'zh-CN', translationOf: english.insertedId, listed: true, draft: false, tags: []
                })
            }, env);

            const enRes = await app.request('/shared-alias?language=en', { method: 'GET' }, env);
            const enData = await enRes.json() as any;
            expect(enData.title).toBe('Alias EN');

            const zhRes = await app.request('/shared-alias?language=zh-CN', { method: 'GET' }, env);
            const zhData = await zhRes.json() as any;
            expect(zhData.title).toBe('Alias ZH');
        });

        it('should filter timeline by language if provided', async () => {
            const englishResponse = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Timeline EN', content: 'English', language: 'en', listed: true, draft: false, tags: []
                })
            }, env);
            const english = await englishResponse.json() as { insertedId: number };

            await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Timeline ZH', content: 'Chinese', language: 'zh-CN', translationOf: english.insertedId, listed: true, draft: false, tags: []
                })
            }, env);

            const zhRes = await app.request('/timeline?language=zh-CN', { method: 'GET' }, env);
            const zhData = await zhRes.json() as any[];
            expect(zhData.some((f: any) => f.title === 'Timeline ZH')).toBe(true);
            expect(zhData.some((f: any) => f.title === 'Timeline EN')).toBe(false);
        });

        it('should filter search results by language if provided', async () => {
            await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Searchable EN', content: 'Searchable content', language: 'en', listed: true, draft: false, tags: []
                })
            }, env);

            await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Searchable ZH', content: 'Searchable content', language: 'zh-CN', listed: true, draft: false, tags: []
                })
            }, env);

            const enRes = await app.request('/search/Searchable?language=en', { method: 'GET' }, env);
            const enData = await enRes.json() as any;
            expect(enData.data.some((f: any) => f.title === 'Searchable EN')).toBe(true);
            expect(enData.data.some((f: any) => f.title === 'Searchable ZH')).toBe(false);
        });

        it('should match hyphenated keyword variants', async () => {
            const createResponse = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Magento e-commerce upgrade', content: 'Practical modernization notes', language: 'en', listed: true, draft: false, tags: []
                })
            }, env);
            const created = await createResponse.json() as { insertedId: number };

            const res = await app.request('/search/ecommerce', { method: 'GET' }, env);
            expect(res.status).toBe(200);
            const data = await res.json() as any;

            expect(data.data.map((feed: any) => feed.id)).toContain(created.insertedId);
        });

        it('should filter low-score semantic search matches by configured threshold', async () => {
            const exactResponse = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Magento ecommerce guide', content: 'Practical ecommerce upgrade notes', language: 'en', listed: true, draft: false, tags: []
                })
            }, env);
            const exact = await exactResponse.json() as { insertedId: number };

            const semanticResponse = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Lumina Tick unrelated article', content: 'A quiet calendar and scheduling article', language: 'en', listed: true, draft: false, tags: []
                })
            }, env);
            const semantic = await semanticResponse.json() as { insertedId: number };

            env.AI = {
                run: async () => ({ data: [[0.1, 0.2, 0.3]] }),
            } as unknown as Env['AI'];
            env.ARTICLE_VECTORIZE = {
                query: async () => ({
                    count: 1,
                    matches: [
                        { id: 'feed:' + semantic.insertedId + ':chunk:0', score: 0.73, metadata: { feedId: semantic.insertedId } },
                    ],
                }),
            } as unknown as Env['ARTICLE_VECTORIZE'];
            await serverConfig.set(SEARCH_VECTOR_SCORE_THRESHOLD_KEY, '0.8', false);

            const res = await app.request('/search/ecommerce', { method: 'GET' }, env);
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            const ids = data.data.map((feed: any) => feed.id);

            expect(ids).toContain(exact.insertedId);
            expect(ids).not.toContain(semantic.insertedId);
        });
    });
});
