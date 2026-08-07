import { getApp } from "./app-instance";
import { getStorageObject } from "../utils/storage";
import { path_join } from "../utils/path";

const ROOT_FEED_PATTERN = /^\/(rss\.xml|atom\.xml|rss\.json|feed\.json|feed\.xml|sitemap\.xml)$/;
const APP_PUBLIC_ROUTE_PATTERN = /^\/(favicon|favicon\.ico)(?:\/|$)/;
const DEFAULT_CANONICAL_HOST = "agenticlife.org";
const DEFAULT_SITE_NAME = "Agentic Life";
const HTML_CONTENT_TYPE_PATTERN = /\btext\/html\b/i;
const PRERENDER_USER_AGENTS = [
  "googlebot",
  "bingbot",
  "yahoo",
  "duckduckbot",
  "baiduspider",
  "yandex",
  "facebookexternalhit",
  "twitterbot",
  "slackbot",
  "linkedinbot",
  "discordbot",
  "whatsapp",
];

function canonicalRedirect(url: URL, env: Env) {
  const canonicalHost = env.CANONICAL_HOST || DEFAULT_CANONICAL_HOST;
  const redirectHosts = new Set([canonicalHost, `www.${canonicalHost}`]);

  if (!redirectHosts.has(url.hostname)) {
    return null;
  }

  if (url.protocol === "https:" && url.hostname === canonicalHost) {
    return null;
  }

  const canonicalUrl = new URL(url);
  canonicalUrl.protocol = "https:";
  canonicalUrl.hostname = canonicalHost;

  return Response.redirect(canonicalUrl.toString(), 308);
}

function isApiRequest(pathname: string) {
  return pathname.startsWith("/api/");
}

function rewriteApiRequest(request: Request) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  return new Request(url, request);
}

function isRootFeedRequest(pathname: string) {
  return ROOT_FEED_PATTERN.test(pathname);
}

function isAppPublicRoute(pathname: string) {
  return APP_PUBLIC_ROUTE_PATTERN.test(pathname);
}

function isStaticAssetRequest(pathname: string) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/locales/") ||
    /^\/(?:favicon\.png|robots\.txt|cantarell_[^/]+\.(?:woff2?|ttf|otf))$/.test(pathname)
  );
}

function isPrerenderedArticleCandidate(pathname: string) {
  const articlePathname = pathname.replace(/^\/(?:en|zh-CN)(?=\/)/, "") || "/";

  if (
    articlePathname === "/" ||
    articlePathname.startsWith("/admin") ||
    articlePathname.startsWith("/api") ||
    isRootFeedRequest(articlePathname) ||
    isAppPublicRoute(articlePathname) ||
    isStaticAssetRequest(articlePathname)
  ) {
    return false;
  }

  return /^\/feed\/[1-9]\d*$/.test(articlePathname) || /^\/[^/]+\/?$/.test(articlePathname);
}

function isPrerenderUserAgent(userAgent: string) {
  return PRERENDER_USER_AGENTS.some((bot) => userAgent.includes(bot));
}

async function tryServePrerenderedHtml(request: Request, env: Env, userAgent: string) {
  if (request.method !== "GET") {
    return null;
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const crawler = isPrerenderUserAgent(userAgent);

  if (!crawler && !isPrerenderedArticleCandidate(pathname)) {
    return null;
  }

  const folder = env.S3_CACHE_FOLDER || "cache/";
  const key = pathname === "/" ? path_join(folder, "index.html") : path_join(folder, pathname);
  const asset = await getStorageObject(env, key);
  if (!asset) {
    return null;
  }

  const newHeaders = new Headers(asset.headers);
  newHeaders.set(
    "Cache-Control",
    crawler ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300",
  );

  if (crawler) {
    newHeaders.set("Vary", "User-Agent");
  } else {
    newHeaders.delete("Vary");
  }

  newHeaders.set("X-Rin-Prerender", "HIT");
  const html = await asset.text();

  return new Response(await normalizePrerenderedHtml(html, url, env), {
    status: asset.status,
    headers: newHeaders,
  });
}

function isHtmlResponse(response: Response) {
  return HTML_CONTENT_TYPE_PATTERN.test(response.headers.get("Content-Type") || "");
}

function normalizeDefaultEnglishPath(pathname: string) {
  return pathname.replace(/^\/en(?=\/)/, "") || "/";
}

function escapeBodyScriptTags(html: string) {
  const headEnd = html.search(/<\/head>/i);
  if (headEnd === -1) {
    return html;
  }

  const bodyStart = headEnd + html.match(/<\/head>/i)![0].length;
  return html.slice(0, bodyStart) + html.slice(bodyStart).replace(/<\/?script\b/gi, (match) => match.replace("<", "&lt;"));
}

function ensureHeadTag(html: string, tag: string, existsPattern: RegExp) {
  if (existsPattern.test(html)) {
    return html;
  }

  return html.replace(/<\/head>/i, `${tag}</head>`);
}

async function getCurrentAssetReferences(requestUrl: URL, env: Env) {
  if (!env.ASSETS) {
    return null;
  }

  try {
    const indexRequest = new Request(new URL("/", requestUrl.origin).toString());
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    if (!indexResponse.ok) {
      return null;
    }

    const indexHtml = await indexResponse.text();
    const scriptMatch = indexHtml.match(/<script\b[^>]*\bsrc=(["'])(\/assets\/[^"']+\.js)\1[^>]*><\/script>/i);
    const styleMatch = indexHtml.match(/<link\b[^>]*\brel=(["'])stylesheet\1[^>]*\bhref=(["'])(\/assets\/[^"']+\.css)\2[^>]*>/i);

    return {
      scriptSrc: scriptMatch?.[2],
      styleHref: styleMatch?.[3],
    };
  } catch {
    return null;
  }
}

async function normalizePrerenderedHtml(html: string, requestUrl: URL, env: Env) {
  const canonicalHost = env.CANONICAL_HOST || DEFAULT_CANONICAL_HOST;
  const origin = `${requestUrl.protocol}//${canonicalHost}`;
  const canonicalPath = normalizeDefaultEnglishPath(requestUrl.pathname);
  const canonicalUrl = `${origin}${canonicalPath}${requestUrl.search}`;
  const documentLanguage = requestUrl.pathname.startsWith("/zh-CN/") ? "zh-CN" : "en";
  const currentAssets = await getCurrentAssetReferences(requestUrl, env);

  let normalized = html
    .replace(/<html\b([^>]*)\s+lang=(["']).*?\2/i, `<html$1 lang="${documentLanguage}"`)
    .replace(/<meta\b[^>]*\bname=(["'])description\1[^>]*\bcontent=(["'])AgenticLife - A lightweight personal blogging system\2[^>]*>/gi, "")
    .replace(/<meta\b[^>]*\bname=(["'])keywords\1[^>]*\bcontent=(["'])blog, personal, agenticlife\2[^>]*>/gi, "")
    .replace(/<meta\b[^>]*\bname=(["'])author\1[^>]*\bcontent=(["'])AgenticLife\2[^>]*>/gi, "")
    .replace(/\bname=(["'])og:description\1/gi, 'property="og:description"')
    .replace(/property=(["'])og:site_name\1\s+content=(["'])\2/gi, `property="og:site_name" content="${DEFAULT_SITE_NAME}"`)
    .replace(new RegExp(`${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/en/`, "g"), `${origin}/`)
    .replace(/\bhref=(["'])\/en\//g, 'href=$1/')
    .replace(/\bcontent=(["'])https:\/\/agenticlife\.org\/en\//g, 'content=$1https://agenticlife.org/')
    .replace(/\bhref=(["'])https:\/\/agenticlife\.org\/en\//g, 'href=$1https://agenticlife.org/');

  if (requestUrl.pathname === "/") {
    normalized = normalized.replace(/property=(["'])og:type\1\s+content=(["'])article\2/gi, 'property="og:type" content="website"');
  }

  if (currentAssets?.scriptSrc) {
    normalized = normalized.replace(/\bsrc=(["'])\/assets\/[^"']+\.js\1/gi, `src="${currentAssets.scriptSrc}"`);
  }

  if (currentAssets?.styleHref) {
    normalized = normalized.replace(/\bhref=(["'])\/assets\/[^"']+\.css\1/gi, `href="${currentAssets.styleHref}"`);
  }

  normalized = ensureHeadTag(
    normalized,
    `<link rel="canonical" href="${canonicalUrl}" data-seo-normalized="true">`,
    /<link\b[^>]*rel=(["'])canonical\1/i,
  );

  return escapeBodyScriptTags(normalized);
}

async function tryServeAsset(request: Request, env: Env) {
  if (!env.ASSETS) {
    return null;
  }

  try {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 200 || (asset.status >= 300 && asset.status < 400)) {
      if (isStaticAssetRequest(new URL(request.url).pathname) && isHtmlResponse(asset)) {
        return null;
      }
      return asset;
    }
  } catch {}

  return null;
}

async function serveSpaEntry(request: Request, env: Env) {
  if (!env.ASSETS) {
    return null;
  }

  try {
    const url = new URL(request.url);
    const indexRequest = new Request(new URL("/", url.origin), request);
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    if (indexResponse.status === 200 || (indexResponse.status >= 300 && indexResponse.status < 400)) {
      return indexResponse;
    }
  } catch {}

  return null;
}

export async function handleFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const redirectResponse = canonicalRedirect(url, env);
  if (redirectResponse) {
    return redirectResponse;
  }

  const pathname = url.pathname;

  const userAgent = request.headers.get("User-Agent")?.toLowerCase() || "";

  const prerenderedHtml = await tryServePrerenderedHtml(request, env, userAgent);
  if (prerenderedHtml) {
    return prerenderedHtml;
  }

  if (isRootFeedRequest(pathname)) {
    return getApp().fetch(request, env, ctx);
  }

  if (isApiRequest(pathname)) {
    return getApp().fetch(rewriteApiRequest(request), env, ctx);
  }

  if (isAppPublicRoute(pathname)) {
    return getApp().fetch(request, env, ctx);
  }

  if (isStaticAssetRequest(pathname)) {
    const asset = await tryServeAsset(request, env);
    if (asset) {
      return asset;
    }

    return new Response("Not found", {
      status: 404,
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  const indexResponse = await serveSpaEntry(request, env);
  if (indexResponse) {
    const newHeaders = new Headers(indexResponse.headers);
    newHeaders.delete("ETag");
    newHeaders.delete("Last-Modified");
    newHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    
    return new Response(indexResponse.body, {
      status: indexResponse.status,
      statusText: indexResponse.statusText,
      headers: newHeaders
    });
  }

  return new Response("Hi", { status: 200 });
}
