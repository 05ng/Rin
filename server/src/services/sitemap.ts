import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import type { AppContext } from "../core/hono-types";
import { feeds } from "../db/schema";
import { profileAsync } from "../core/server-timing";

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

        // Add static routes
        for (const route of staticRoutes) {
            xml += '  <url>\n';
            xml += `    <loc>${frontendUrl}${route}</loc>\n`;
            xml += '    <changefreq>daily</changefreq>\n';
            xml += '    <priority>0.8</priority>\n';
            xml += '  </url>\n';
        }

        // Add dynamic feeds
        for (const feed of feedList) {
            const urlPath = feed.alias 
                ? `/${encodeURIComponent(feed.alias)}` 
                : `/feed/${feed.id}`;
            const lastMod = feed.updatedAt ? feed.updatedAt.toISOString().split('T')[0] : '';
            
            xml += '  <url>\n';
            xml += `    <loc>${frontendUrl}${urlPath}</loc>\n`;
            if (lastMod) {
                xml += `    <lastmod>${lastMod}</lastmod>\n`;
            }
            xml += '    <changefreq>weekly</changefreq>\n';
            xml += '    <priority>0.6</priority>\n';
            xml += '  </url>\n';
        }

        xml += '</urlset>';

        return c.text(xml, 200, {
            'Content-Type': 'application/xml; charset=UTF-8',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        });
    });

    return app;
}
