import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import type { AppContext } from "../core/hono-types";
import { feeds } from "../db/schema";
import { profileAsync } from "../core/server-timing";

function articlePath(id: number, alias: string | null, language: string) {
    const path = alias ? `/${encodeURIComponent(alias)}` : `/feed/${id}`;
    return language === 'en' ? path : `/${language}${path}`;
}

function appendUrl(
    xml: string,
    seenUrls: Set<string>,
    loc: string,
    options: { lastMod?: string; changefreq: string; priority: string },
) {
    if (seenUrls.has(loc)) {
        return xml;
    }

    seenUrls.add(loc);

    xml += '  <url>\n';
    xml += `    <loc>${loc}</loc>\n`;
    if (options.lastMod) {
        xml += `    <lastmod>${options.lastMod}</lastmod>\n`;
    }
    xml += `    <changefreq>${options.changefreq}</changefreq>\n`;
    xml += `    <priority>${options.priority}</priority>\n`;
    xml += '  </url>\n';

    return xml;
}

export function SitemapService(): Hono {
    const app = new Hono();

    app.get('/sitemap.xml', async (c: AppContext) => {
        const db = c.get('db');
        const frontendUrl = new URL(c.req.url).origin;

        // Fetch feeds
        const feedList = await profileAsync(c, 'sitemap_feed_list', () => db.query.feeds.findMany({
            where: and(eq(feeds.draft, 0), eq(feeds.listed, 1)),
            orderBy: [desc(feeds.updatedAt)],
            columns: {
                id: true,
                alias: true,
                language: true,
                updatedAt: true
            }
        }));

        const staticRoutes = [
            '/',
            '/timeline',
            '/moments',
            '/friends',
            '/game',
            '/tools',
            '/hashtags'
        ];

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        const seenUrls = new Set<string>();

        // Add static routes
        for (const route of staticRoutes) {
            xml = appendUrl(xml, seenUrls, `${frontendUrl}${route}`, {
                changefreq: 'daily',
                priority: '0.8',
            });
        }

        // Add dynamic feeds
        for (const feed of feedList) {
            const urlPath = articlePath(feed.id, feed.alias, feed.language);
            const lastMod = feed.updatedAt ? feed.updatedAt.toISOString().split('T')[0] : '';

            xml = appendUrl(xml, seenUrls, `${frontendUrl}${urlPath}`, {
                lastMod,
                changefreq: 'weekly',
                priority: '0.6',
            });
        }

        xml += '</urlset>';

        return c.text(xml, 200, {
            'Content-Type': 'application/xml; charset=UTF-8',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        });
    });

    return app;
}
