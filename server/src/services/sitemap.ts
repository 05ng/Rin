import { Hono } from "hono";
import { and, eq, desc, count } from "drizzle-orm";
import type { AppContext } from "../core/hono-types";
import { feeds, moments } from "../db/schema";
import { profileAsync } from "../core/server-timing";

const DEFAULT_CANONICAL_HOST = "agenticlife.org";

function getCanonicalBaseUrl(env: Env, reqUrl: string) {
    if (env.CANONICAL_HOST) {
        return `https://${env.CANONICAL_HOST}`;
    }
    const origin = new URL(reqUrl).origin;
    if (origin.includes("agenticlife.org")) {
        return `https://${DEFAULT_CANONICAL_HOST}`;
    }
    return origin;
}

function articlePath(id: number, alias: string | null, language: string) {
    const path = alias ? `/${encodeURIComponent(alias)}` : `/feed/${id}`;
    return language === 'en' ? path : `/${language}${path}`;
}

type SitemapAlternate = {
    language: string;
    url: string;
};

function appendUrl(
    xml: string,
    seenUrls: Set<string>,
    loc: string,
    options: { lastMod?: string; changefreq: string; priority: string; alternates?: SitemapAlternate[] },
) {
    if (seenUrls.has(loc)) {
        return xml;
    }

    seenUrls.add(loc);

    xml += '  <url>\n';
    xml += `    <loc>${loc}</loc>\n`;
    for (const alternate of options.alternates ?? []) {
        xml += `    <xhtml:link rel="alternate" hreflang="${alternate.language}" href="${alternate.url}" />\n`;
    }
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
        const frontendUrl = getCanonicalBaseUrl(c.env, c.req.url);

        // Fetch feeds
        const feedList = await profileAsync(c, 'sitemap_feed_list', () => db.query.feeds.findMany({
            where: and(eq(feeds.draft, 0), eq(feeds.listed, 1)),
            orderBy: [desc(feeds.updatedAt)],
            columns: {
                id: true,
                alias: true,
                language: true,
                translationGroup: true,
                updatedAt: true
            }
        }));

        // Only include /moments in sitemap if moments actually exist
        const momentsCountResult = await profileAsync(c, 'sitemap_moments_count', () =>
            db.select({ count: count() }).from(moments)
        );
        const hasMoments = (momentsCountResult[0]?.count ?? 0) > 0;

        const staticRoutes = [
            '/',
            ...(hasMoments ? ['/moments'] : []),
            '/tools',
            '/game',
        ];

        const siteLastMod = feedList[0]?.updatedAt ? feedList[0].updatedAt.toISOString().split('T')[0] : undefined;
        const articleUrlById = new Map<number, string>();
        const articlesByTranslationGroup = new Map<number, typeof feedList>();

        for (const feed of feedList) {
            const group = feed.translationGroup || feed.id;
            articleUrlById.set(feed.id, `${frontendUrl}${articlePath(feed.id, feed.alias, feed.language)}`);
            articlesByTranslationGroup.set(group, [
                ...(articlesByTranslationGroup.get(group) ?? []),
                feed,
            ]);
        }

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
        const seenUrls = new Set<string>();

        // Add static routes
        for (const route of staticRoutes) {
            xml = appendUrl(xml, seenUrls, `${frontendUrl}${route}`, {
                lastMod: siteLastMod,
                changefreq: 'daily',
                priority: '0.8',
            });
        }

        // Add dynamic feeds
        for (const feed of feedList) {
            const group = feed.translationGroup || feed.id;
            const translations = articlesByTranslationGroup.get(group) ?? [];
            const alternates = translations.length > 1
                ? [
                    ...translations.map((translation) => ({
                        language: translation.language,
                        url: articleUrlById.get(translation.id) || `${frontendUrl}${articlePath(translation.id, translation.alias, translation.language)}`,
                    })),
                    {
                        language: 'x-default',
                        url: articleUrlById.get(translations.find((translation) => translation.language === 'en')?.id ?? feed.id) || `${frontendUrl}${articlePath(feed.id, feed.alias, feed.language)}`,
                    },
                ]
                : undefined;
            const urlPath = articlePath(feed.id, feed.alias, feed.language);
            const lastMod = feed.updatedAt ? feed.updatedAt.toISOString().split('T')[0] : '';

            xml = appendUrl(xml, seenUrls, `${frontendUrl}${urlPath}`, {
                alternates,
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
