import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import type { Variables } from "../../core/hono-types";
import { SitemapService } from "../sitemap";
import { cleanupTestDB, setupTestApp } from "../../../tests/fixtures";

describe("SitemapService", () => {
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;

    beforeEach(async () => {
        const ctx = await setupTestApp(SitemapService);
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;

        sqlite.exec(`
            INSERT INTO users (id, username, avatar, openid) VALUES (1, 'testuser', 'avatar.png', 'gh_test');
            INSERT INTO feeds (id, alias, title, content, language, draft, listed, uid, updated_at) VALUES
                (1, 'about', 'About EN', 'English content', 'en', 0, 1, 1, unixepoch()),
                (2, 'about', 'About ZH', 'Chinese content', 'zh-CN', 0, 1, 1, unixepoch()),
                (3, null, 'No Alias', 'Fallback URL', 'en', 0, 1, 1, unixepoch()),
                (4, 'draft-post', 'Draft', 'Draft content', 'en', 1, 1, 1, unixepoch()),
                (5, 'hidden-post', 'Hidden', 'Hidden content', 'en', 0, 0, 1, unixepoch())
        `);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    it("emits deduped canonical article URLs", async () => {
        const response = await app.request("https://agenticlife.org/sitemap.xml", { method: "GET" }, env);

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("application/xml; charset=UTF-8");

        const xml = await response.text();

        expect(xml).toContain("<loc>https://agenticlife.org/about</loc>");
        expect(xml).toContain("<loc>https://agenticlife.org/zh-CN/about</loc>");
        expect(xml).toContain("<loc>https://agenticlife.org/feed/3</loc>");
        expect(xml).not.toContain("<loc>https://agenticlife.org/en/about</loc>");
        expect(xml).not.toContain("<loc>https://agenticlife.org/en/feed/3</loc>");
        expect(xml).not.toContain("draft-post");
        expect(xml).not.toContain("hidden-post");
        expect(xml.match(/<loc>https:\/\/agenticlife\.org\/about<\/loc>/g) ?? []).toHaveLength(1);
    });
});
