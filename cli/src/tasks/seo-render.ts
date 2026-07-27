import path from "node:path";
import puppeteer from "puppeteer";
import { getWranglerEnv } from "../lib/wrangler";

const bunExec = process.execPath;
const wranglerCwd = "server";

async function runWranglerQuiet(args: string[]) {
  const proc = Bun.spawn([bunExec, "x", "wrangler", ...args], {
    cwd: wranglerCwd,
    env: getWranglerEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `wrangler failed with exit code ${exitCode}`);
  }
}

export async function runSeoRender() {
  const env = process.env;
  const baseUrl = env.SEO_BASE_URL || "";
  const containsKey = env.SEO_CONTAINS_KEY || "";
  const folder = env.S3_CACHE_FOLDER || "cache/";

  if (!baseUrl) {
    throw new Error("SEO_BASE_URL is not set");
  }

  async function saveFile(filename: string, data: string) {
    const url = new URL(filename);
    let key = path.join(folder, url.pathname + url.search.replace("?", "&"));
    if (key.endsWith("/")) {
      key += "index.html";
    }
    
    await runWranglerQuiet([
        "d1",
        "execute",
        "rin",
        "--local",
        "--command",
        `INSERT OR REPLACE INTO rendered_pages (path, html) VALUES ('${key}', '${data.replace(/'/g, "''")}')`,
    ]);

    console.info(`Saved ${key} to database.`);
  }

  const fetchedLinks = new Set<string>();
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36";

  async function fetchPage(url: string): Promise<void> {
    const page = await browser.newPage();
    await page.setUserAgent(ua);
    const response = await page.goto(url, { waitUntil: "networkidle2" });
    if (!response) return;
    if (response.ok() && response.headers()["content-type"]?.includes("text/html")) {
      await saveFile(url, await page.content());
      fetchedLinks.add(url);
      const links = await page.evaluate(() => Array.from(document.querySelectorAll("a")).map((anchor) => anchor.href));
      for (const link of links.filter((candidate) => candidate.startsWith(baseUrl) || (containsKey && candidate.includes(containsKey)))) {
        const next = link.split("#")[0];
        if (!fetchedLinks.has(next)) {
          await fetchPage(next);
        }
      }
    }
    await page.close();
  }

  await fetchPage(baseUrl);
  await browser.close();
}
